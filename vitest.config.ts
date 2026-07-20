import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests for the app's PURE logic — the tiling math, path/quoting helpers,
// diff-path decoding, version comparison. These carry real invariants but were
// completely untested: the only safety net was a handful of Electron smoke
// scripts, which are slow, and 5 of the 9 didn't even run in CI.
//
// Deliberately separate from electron.vite.config.ts: that config builds three
// bundles for Electron, none of which is a test target. jsdom is the environment
// because the renderer modules touch localStorage/window at import time.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // The Electron smoke scripts live in scripts/ and are driven by `npm run
    // smoke:*`, not by vitest.
    exclude: ['node_modules/**', 'out/**', 'dist/**', 'scripts/**']
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  }
})
