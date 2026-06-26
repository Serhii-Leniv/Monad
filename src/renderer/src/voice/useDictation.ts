import { useSyncExternalStore } from 'react'
import { insertTranscript } from './insertTranscript'
import { useStore } from '../store'
import type { SttIn, SttOut } from './sttWorker'

/** Friendly text for the common, otherwise-cryptic mic failures. */
function friendlyError(raw: string): string {
  if (/NotAllowed|Permission/i.test(raw)) return 'Microphone permission denied'
  if (/NotFound|Requested device/i.test(raw)) return 'No microphone found'
  if (/NotReadable|in use/i.test(raw)) return 'Microphone is in use by another app'
  return raw
}

/**
 * Dictation controller — a single module-level instance owns the mic, the
 * AudioWorklet and the STT worker, so it behaves identically no matter how many
 * components drive it (the mic button AND the global hotkey share one engine).
 * React components subscribe via the `useDictation` hook below.
 */

export type DictationStatus =
  | 'idle' // model not loaded yet
  | 'loading' // loading the model
  | 'ready' // model loaded, mic off
  | 'listening' // capturing audio
  | 'transcribing' // model is decoding a segment
  | 'error'

interface DictationState {
  status: DictationStatus
  device: string | null
  level: number // 0..1 mic level, for the UI indicator
  error: string | null
  lastText: string | null
}

const SAMPLE_RATE = 16000
// VAD (toggle mode): RMS above this counts as speech.
const SILENCE_RMS = 0.012
// Flush a segment after this much trailing silence.
const SILENCE_HANG_MS = 650
// Ignore segments shorter than this (stray clicks/noise).
const MIN_SEGMENT_MS = 250
// Cap a continuous segment so a pause-free monologue can't buffer unbounded —
// force a flush past this length even without a silence gap.
const MAX_SEGMENT_MS = 12000
// Throttle mic-level UI updates so the per-frame audio callback doesn't
// re-render subscribers at audio rate.
const LEVEL_INTERVAL_MS = 60

class Dictation {
  private state: DictationState = {
    status: 'idle',
    device: null,
    level: 0,
    error: null,
    lastText: null
  }
  private listeners = new Set<() => void>()

  private worker: Worker | null = null
  private modelReady: Promise<void> | null = null
  private modelInitReject: ((e: Error) => void) | null = null
  private reqId = 0
  // Only results from this id (the latest live mic segment) are inserted —
  // the diagnostics transcribeForTest() uses its own ids and is ignored here.
  private liveReqId = -1

  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  // Live spectrum for the waveform visualizer (only while the mic is open).
  private analyser: AnalyserNode | null = null
  private freq: Uint8Array<ArrayBuffer> | null = null
  // True while a dictation session is live (mic open or starting up).
  private active = false
  // One-shot (push-to-talk) sessions auto-stop after the first utterance ends;
  // toggle sessions run until the user triggers again.
  private oneShot = false
  // Set if the session is stopped while the model/mic are still starting up, so
  // the in-flight startSession() tears down instead of getting stuck listening.
  private startCanceled = false

  // Capture buffers / VAD bookkeeping.
  private chunks: Float32Array[] = []
  private voicedSamples = 0
  private silenceSamples = 0
  private bufferedSamples = 0
  private lastLevelAt = 0

  // --- subscription plumbing (useSyncExternalStore) ---
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getSnapshot = (): DictationState => this.state
  private set(patch: Partial<DictationState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  // --- model lifecycle (lazy) ---
  private ensureModel(): Promise<void> {
    if (this.modelReady) return this.modelReady
    this.set({ status: 'loading', error: null })
    const worker = new Worker(new URL('./sttWorker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (e: MessageEvent<SttOut>) => this.onWorker(e.data)
    // A script/runtime-level worker crash must reject the pending load, else
    // ensureModel() returns a never-settling promise and dictation hangs forever.
    worker.onerror = (e) => this.failInit(new Error(e.message || 'voice worker crashed'))

    this.modelReady = new Promise<void>((resolve, reject) => {
      this.modelInitReject = reject
      const onMsg = (e: MessageEvent<SttOut>): void => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onMsg)
          resolve()
        } else if (e.data.type === 'error') {
          worker.removeEventListener('message', onMsg)
          reject(new Error(e.data.error))
        }
      }
      worker.addEventListener('message', onMsg)
      // Base URL → resolves the locally-bundled model + ort wasm assets.
      const baseUrl = new URL('.', window.location.href).href
      console.log('[voice] init baseUrl =', baseUrl, '| location =', window.location.href)
      this.post({ type: 'init', baseUrl })
    })
      .then(() => {
        this.modelInitReject = null
        if (this.state.status === 'loading') this.set({ status: 'ready' })
      })
      .catch((err) => {
        // Tear the worker down so a later attempt rebuilds it from scratch.
        this.modelInitReject = null
        this.modelReady = null
        this.worker?.terminate()
        this.worker = null
        this.set({ status: 'error', error: String(err?.message ?? err) })
        throw err
      })
    return this.modelReady
  }

  /** Reject a still-pending model load (worker.onerror) so callers don't hang. */
  private failInit(err: Error): void {
    if (this.modelInitReject) this.modelInitReject(err)
    else this.fail(err.message)
  }

  /** Set the error state and surface it via the app's toast channel. */
  private fail(raw: string): void {
    console.error('[voice] FAIL:', raw)
    const error = friendlyError(raw)
    this.set({ status: 'error', error })
    try {
      useStore.getState().pushToast(`Voice input: ${error}`, 'error')
    } catch {
      /* store not ready */
    }
  }

  private post(msg: SttIn, transfer?: Transferable[]): void {
    this.worker?.postMessage(msg, transfer ?? [])
  }

  private onWorker(msg: SttOut): void {
    if (msg.type === 'ready') {
      this.set({ status: this.node ? 'listening' : 'ready', device: msg.device })
    } else if (msg.type === 'result') {
      if (msg.id !== this.liveReqId) return // ignore diagnostics / stale segments
      if (msg.text) {
        insertTranscript(msg.text)
        this.set({ lastText: msg.text })
      }
      // Return to the right resting state once decoding finishes.
      if (this.state.status === 'transcribing') {
        this.set({ status: this.node ? 'listening' : 'ready' })
      }
    } else if (msg.type === 'error') {
      // Init errors (no id) and the live segment's errors surface; ignore errors
      // belonging to a superseded/diagnostics request.
      if (msg.id !== undefined && msg.id !== this.liveReqId) return
      this.fail(msg.error)
    }
  }

  // --- audio capture ---
  private async openMic(): Promise<void> {
    if (this.node) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    await this.ctx.audioWorklet.addModule(
      new URL('.', window.location.href).href + 'voice/pcm-worklet.js'
    )
    const src = this.ctx.createMediaStreamSource(this.stream)
    // Spectrum tap for the visualizer (fans out from the same source).
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 128
    this.analyser.smoothingTimeConstant = 0.72
    src.connect(this.analyser)
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onPcm(e.data)
    src.connect(this.node)
    // Keep the graph pulling without routing mic to the speakers.
    const sink = this.ctx.createGain()
    sink.gain.value = 0
    this.node.connect(sink).connect(this.ctx.destination)
  }

  private closeMic(): void {
    this.node?.port.close()
    this.node?.disconnect()
    this.node = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.analyser = null
    void this.ctx?.close()
    this.ctx = null
    this.set({ level: 0 })
  }

  /** Live spectrum sampled into `n` normalized bars (0..1) for the visualizer. */
  getBars(n: number): number[] {
    const a = this.analyser
    const out = new Array<number>(n).fill(0)
    if (!a) return out
    if (!this.freq || this.freq.length !== a.frequencyBinCount) {
      this.freq = new Uint8Array(a.frequencyBinCount)
    }
    a.getByteFrequencyData(this.freq)
    // Voice energy sits in the low/mid bins — ignore the very top of the range.
    const usable = Math.floor(this.freq.length * 0.65)
    const per = Math.max(1, Math.floor(usable / n))
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = 0; j < per; j++) sum += this.freq[i * per + j] || 0
      out[i] = Math.min(1, (sum / per / 255) * 1.7)
    }
    return out
  }

  private resetCapture(): void {
    this.chunks = []
    this.voicedSamples = 0
    this.silenceSamples = 0
    this.bufferedSamples = 0
  }

  private onPcm(frame: Float32Array): void {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    const rms = Math.sqrt(sum / frame.length)

    // Mic level for the indicator — throttled so frames (audio rate) don't churn
    // re-renders.
    const now = performance.now()
    if (now - this.lastLevelAt >= LEVEL_INTERVAL_MS) {
      this.lastLevelAt = now
      this.set({ level: Math.min(1, this.state.level * 0.6 + rms * 6 * 0.4) })
    }

    this.chunks.push(frame)
    this.bufferedSamples += frame.length

    // Energy VAD: count voiced vs trailing silence; flush on a pause.
    if (rms > SILENCE_RMS) {
      this.voicedSamples += frame.length
      this.silenceSamples = 0
    } else {
      this.silenceSamples += frame.length
    }
    const hang = (SILENCE_HANG_MS / 1000) * SAMPLE_RATE
    const minS = (MIN_SEGMENT_MS / 1000) * SAMPLE_RATE
    const maxS = (MAX_SEGMENT_MS / 1000) * SAMPLE_RATE
    if (this.silenceSamples >= hang && this.voicedSamples >= minS) {
      this.endSegment() // utterance + pause → flush (and auto-stop if one-shot)
    } else if (this.silenceSamples >= hang) {
      this.resetCapture() // pure silence → drop
    } else if (this.bufferedSamples >= maxS && this.voicedSamples >= minS) {
      this.endSegment() // pause-free monologue → cap & flush
    }
  }

  /** A complete utterance was detected: transcribe it; end the session if one-shot. */
  private endSegment(): void {
    const posted = this.transcribeBuffered()
    // One-shot (push-to-talk): the first utterance ends the session. Keep the
    // 'transcribing' status posted above until the result lands (onWorker resets
    // it) — don't re-flush.
    if (this.oneShot) this.finishSession(posted)
  }

  // --- public API ---
  /**
   * The single entry point for every trigger (global shortcut + both mic
   * buttons): stop if a session is live, otherwise start one. The
   * `voiceActivation` setting decides whether it runs continuously until the
   * next trigger (`toggle`) or auto-stops after one utterance (`ptt`).
   */
  trigger(): void {
    if (this.active) {
      this.stopSession()
      return
    }
    const ptt = useStore.getState().settings.voiceActivation === 'ptt'
    void this.startSession(ptt)
  }

  /** Begin a continuous (hold-to-talk) session — paired with stop() on key release. */
  start(): void {
    if (this.active) return
    void this.startSession(false)
  }

  /** End the current session (hold-to-talk release, or explicit stop). */
  stop(): void {
    this.stopSession()
  }

  private async startSession(oneShot: boolean): Promise<void> {
    if (this.active) return
    this.active = true
    this.oneShot = oneShot
    this.startCanceled = false
    try {
      try {
        await this.ensureModel()
      } catch {
        // One silent retry — a failed load terminates the worker, so this
        // rebuilds it from scratch (covers transient dev reloads / first-load
        // hiccups) before surfacing an error to the user.
        if (this.startCanceled) {
          this.active = false
          this.set({ status: 'ready' })
          return
        }
        await this.ensureModel()
      }
      await this.openMic()
      // Stopped during startup → tear down without listening.
      if (this.startCanceled) {
        this.closeMic()
        this.active = false
        this.set({ status: 'ready' })
        return
      }
      this.resetCapture()
      this.set({ status: 'listening', error: null })
    } catch (err) {
      this.active = false
      this.fail(String((err as Error)?.message ?? err))
    }
  }

  /** Explicit stop (trigger while live): flush the buffer, then tear down. */
  private stopSession(): void {
    if (!this.active) return
    if (!this.node) {
      // Still starting up — flag the in-flight startSession() to bail.
      this.startCanceled = true
      this.active = false
      return
    }
    this.finishSession(this.transcribeBuffered())
  }

  /**
   * Tear the mic down and return to a resting state. Keeps the 'transcribing'
   * status (set by transcribeBuffered) when a segment is still decoding — the
   * onWorker 'result' handler resets it once the text lands.
   */
  private finishSession(posted: boolean): void {
    this.closeMic()
    this.active = false
    this.oneShot = false
    if (!posted) this.set({ status: this.modelReady ? 'ready' : 'idle' })
  }

  /**
   * Concatenate the buffered audio and hand it to the worker. Returns true if a
   * segment was actually posted (so callers know whether to keep the
   * 'transcribing' status or reset to a resting state).
   */
  private transcribeBuffered(): boolean {
    const total = this.bufferedSamples
    const minS = (MIN_SEGMENT_MS / 1000) * SAMPLE_RATE
    const captured = this.chunks
    const voiced = this.voicedSamples
    this.resetCapture()
    if (total === 0) return false
    // Require some voiced audio so we never transcribe pure silence.
    if (voiced < minS) return false
    const pcm = new Float32Array(total)
    let off = 0
    for (const c of captured) {
      pcm.set(c, off)
      off += c.length
    }
    this.liveReqId = ++this.reqId
    this.set({ status: 'transcribing' })
    this.post({ type: 'transcribe', id: this.liveReqId, pcm }, [pcm.buffer])
    return true
  }

  /**
   * Diagnostics only: load the model (if needed) and transcribe a raw 16 kHz
   * mono PCM buffer directly, bypassing the mic. Its result is NOT inserted into
   * the UI (onWorker gates on liveReqId) — it resolves here instead.
   */
  async transcribeForTest(pcm: Float32Array): Promise<string> {
    await this.ensureModel()
    const id = ++this.reqId
    return new Promise<string>((resolve, reject) => {
      const onMsg = (e: MessageEvent<SttOut>): void => {
        const m = e.data
        if (m.type === 'result' && m.id === id) {
          this.worker?.removeEventListener('message', onMsg)
          resolve(m.text)
        } else if (m.type === 'error' && m.id === id) {
          this.worker?.removeEventListener('message', onMsg)
          reject(new Error(m.error))
        }
      }
      this.worker?.addEventListener('message', onMsg)
      const buf = pcm.slice()
      this.post({ type: 'transcribe', id, pcm: buf }, [buf.buffer])
    })
  }
}

export const dictation = new Dictation()

// Exposed for diagnostics / smoke tests (mirrors __agentStore).
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__dictation = dictation
}

export function useDictation(): DictationState & { trigger: () => void } {
  const state = useSyncExternalStore(dictation.subscribe, dictation.getSnapshot)
  return { ...state, trigger: () => dictation.trigger() }
}
