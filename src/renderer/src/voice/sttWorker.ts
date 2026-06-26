/// <reference lib="webworker" />
/**
 * Speech-to-text Web Worker. Runs Moonshine (base.en) ONNX entirely off the
 * React main thread via transformers.js, WebGPU with an automatic WASM fallback.
 *
 * Fully offline: the model and the onnxruntime-web `.wasm` binaries are served
 * as local app assets (see src/renderer/public/voice/*). `allowRemoteModels` is
 * forced off so nothing is ever fetched from the Hugging Face CDN at runtime.
 *
 * The worker is intentionally engine-agnostic: it only knows "PCM in → text
 * out", so the model can later be swapped for a native whisper.cpp backend
 * without touching the hook or UI.
 */
import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers'

// Local English Moonshine build. Resolved under env.localModelPath (set on init).
const MODEL_ID = 'moonshine-base-ONNX'

export type SttIn =
  | { type: 'init'; baseUrl: string }
  | { type: 'transcribe'; id: number; pcm: Float32Array }

export type SttOut =
  | { type: 'ready'; device: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; error: string }

let asr: AutomaticSpeechRecognitionPipeline | null = null
let loading: Promise<void> | null = null

/** Strip trailing path segment so worker assets resolve from the app root. */
function ensureTrailingSlash(u: string): string {
  return u.endsWith('/') ? u : u + '/'
}

interface GpuAdapterLike {
  features?: { has?(name: string): boolean }
}
interface GpuLike {
  requestAdapter(): Promise<GpuAdapterLike | null>
}

/**
 * Decide whether WebGPU is *safe* here. onnxruntime-web's WebGPU backend reads
 * subgroup limits that software / partial adapters don't expose, crashing with
 * "Cannot read properties of undefined (reading 'subgroupMinSize')". We only
 * trust WebGPU when the adapter actually advertises the `subgroups` feature;
 * otherwise WASM (rock-solid everywhere) is used.
 */
async function webgpuUsable(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu
    if (!gpu?.requestAdapter) return false
    const adapter = await gpu.requestAdapter()
    if (!adapter) return false
    return adapter.features?.has?.('subgroups') === true
  } catch {
    return false
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('webgpu init timed out')), ms))
  ])
}

function build(
  device: 'webgpu' | 'wasm'
): Promise<AutomaticSpeechRecognitionPipeline> {
  // Full precision on both paths: Moonshine's q8 export uses MatMulNBits, which
  // onnxruntime-web's WASM EP can't create a session for (missing-scale error).
  return pipeline('automatic-speech-recognition', MODEL_ID, {
    device,
    dtype: 'fp32'
  }) as Promise<AutomaticSpeechRecognitionPipeline>
}

/**
 * Guard against a dev-server SPA fallback (or a stale reload) handing back
 * index.html for a missing asset: turn the resulting opaque "Unexpected token
 * '<'" JSON crash into a clear, actionable error that names the URL.
 */
function installFetchGuard(): void {
  const g = self as unknown as { __fetchGuarded?: boolean; fetch: typeof fetch }
  if (g.__fetchGuarded) return
  g.__fetchGuarded = true
  const orig = g.fetch.bind(self)
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await orig(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html') && /\.(json|onnx|wasm|mjs|txt)(\?|$)/i.test(url)) {
      throw new Error(`voice asset request returned HTML (not found): ${url}`)
    }
    return res
  }
}

async function init(baseUrl: string): Promise<void> {
  installFetchGuard()
  const base = ensureTrailingSlash(baseUrl)
  // Hard offline guarantees — never touch the network.
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = base + 'voice/models/'
  // Point onnxruntime-web at the locally-bundled wasm binaries.
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = base + 'voice/ort/'

  // Try WebGPU only when it looks safe, time-boxed so a hung/crashing GPU init
  // can never leave the model stuck loading — we always fall back to WASM.
  if (await webgpuUsable()) {
    try {
      asr = await withTimeout(build('webgpu'), 12000)
      post({ type: 'ready', device: 'webgpu' })
      return
    } catch {
      asr = null // fall through to WASM
    }
  }

  asr = await build('wasm')
  post({ type: 'ready', device: 'wasm' })
}

function post(msg: SttOut, transfer?: Transferable[]): void {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? [])
}

self.onmessage = async (e: MessageEvent<SttIn>): Promise<void> => {
  const msg = e.data
  if (msg.type === 'init') {
    if (!loading) loading = init(msg.baseUrl).catch((err) => {
      loading = null
      post({ type: 'error', error: String(err?.message ?? err) })
      throw err
    })
    return
  }
  if (msg.type === 'transcribe') {
    try {
      if (loading) await loading
      if (!asr) throw new Error('STT model not initialised')
      // Moonshine expects 16 kHz mono Float32 PCM, which is what the hook sends.
      const out = await asr(msg.pcm)
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) ?? ''
      post({ type: 'result', id: msg.id, text: text.trim() })
    } catch (err) {
      post({ type: 'error', id: msg.id, error: String((err as Error)?.message ?? err) })
    }
  }
}
