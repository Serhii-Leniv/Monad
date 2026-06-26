// AudioWorklet that forwards mono Float32 PCM from the mic to the main thread.
// The AudioContext runs at 16 kHz, so frames are already at the rate Moonshine
// expects — no resampling. Each 128-sample render quantum is posted as it
// arrives (transferred, not copied into a larger batch) so no trailing samples
// are ever lost when the mic is torn down mid-utterance.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0] // mono
    if (!ch || ch.length === 0) return true
    const out = new Float32Array(ch.length)
    out.set(ch)
    this.port.postMessage(out, [out.buffer])
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
