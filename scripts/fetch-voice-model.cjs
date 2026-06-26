#!/usr/bin/env node
/**
 * One-time setup for offline voice dictation. Populates the bundled, app-origin
 * assets that the STT worker loads at runtime:
 *
 *   src/renderer/public/voice/models/moonshine-base-ONNX/   <- the model (HF)
 *   src/renderer/public/voice/ort/                          <- onnxruntime-web wasm
 *
 * Run once (needs network): `npm run setup:voice`. After that the app is fully
 * offline — nothing is fetched from the Hugging Face CDN at runtime.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const REPO = 'onnx-community/moonshine-base-ONNX'
const ROOT = path.resolve(__dirname, '..')
const MODEL_DIR = path.join(ROOT, 'src/renderer/public/voice/models/moonshine-base-ONNX')
const ORT_DIR = path.join(ROOT, 'src/renderer/public/voice/ort')
const ORT_SRC = path.join(ROOT, 'node_modules/onnxruntime-web/dist')

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'vectro-setup' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          // Redirect Location may be relative — resolve it against the request URL.
          const next = new URL(res.headers.location, url).href
          return resolve(get(next))
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`GET ${url} -> ${res.statusCode}`))
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      })
      .on('error', reject)
  })
}

async function listFiles() {
  const buf = await get(`https://huggingface.co/api/models/${REPO}/tree/main?recursive=true`)
  const tree = JSON.parse(buf.toString('utf8'))
  return tree.filter((e) => e.type === 'file').map((e) => e.path)
}

async function downloadModel() {
  fs.mkdirSync(MODEL_DIR, { recursive: true })
  const files = await listFiles()
  // Only the JSON config/tokenizer files transformers.js needs + the onnx graphs;
  // skip repo cruft (.gitattributes, README) and large duplicate precisions
  // (fp16/bnb/uint8) to keep the installer lean. transformers.js loads
  // encoder_model + decoder_model_merged (quantized by default).
  const wanted = files.filter((f) => {
    if (f.startsWith('onnx/')) {
      return /(encoder_model|decoder_model_merged)(_quantized)?\.onnx$/.test(f)
    }
    return f.endsWith('.json') // config.json, tokenizer.json, generation_config.json, …
  })
  for (const rel of wanted) {
    const dest = path.join(MODEL_DIR, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    process.stdout.write(`  ↓ ${rel} … `)
    const data = await get(`https://huggingface.co/${REPO}/resolve/main/${rel}`)
    fs.writeFileSync(dest, data)
    console.log(`${(data.length / 1e6).toFixed(1)} MB`)
  }
}

function copyOrtWasm() {
  fs.mkdirSync(ORT_DIR, { recursive: true })
  if (!fs.existsSync(ORT_SRC)) {
    throw new Error(`onnxruntime-web not found at ${ORT_SRC} — run npm install first`)
  }
  const assets = fs.readdirSync(ORT_SRC).filter((f) => /\.(wasm|mjs)$/.test(f))
  for (const f of assets) {
    fs.copyFileSync(path.join(ORT_SRC, f), path.join(ORT_DIR, f))
  }
  console.log(`  copied ${assets.length} onnxruntime-web asset(s)`)
}

;(async () => {
  console.log('Voice setup: copying onnxruntime-web wasm…')
  copyOrtWasm()
  console.log(`Voice setup: downloading ${REPO}…`)
  await downloadModel()
  console.log('Done. Voice dictation assets are bundled and offline-ready.')
})().catch((err) => {
  console.error('Voice setup failed:', err.message)
  process.exit(1)
})
