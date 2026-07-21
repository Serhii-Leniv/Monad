// Runs one smoke test and judges it by the verdict it PRINTS, not by the exit
// code of the process.
//
// Why: these smokes drive real Electron + a real node-pty, and an Electron
// process with a live native module cannot be relied on to exit with the code it
// asks for. Observed on this repo, all AFTER the test had printed RESULT: PASS:
//
//   exit 1    process.exit lost a race with Electron's own shutdown (seen on CI
//             when two jobs shared a runner and everything ran slow)
//   exit 139  segfault in node-pty's native teardown
//   no exit   hung in the same teardown
//
// Each of those reported a passing test as a CI failure. The fix is not to keep
// tuning the shutdown — it's to stop asking a crashing process what it thought
// the answer was, and read the answer it already wrote down.
//
// This is STRICTER than a plain exit-code check in the ways that matter:
//   - crash BEFORE the verdict      -> no RESULT line -> FAIL (correct)
//   - test reports RESULT: FAIL     -> FAIL (correct)
//   - hang                          -> killed at the cap -> FAIL (correct)
// It only stops counting "crashed while shutting down, having already passed" as
// a failure. That case is still printed loudly below, so it stays visible rather
// than becoming background noise nobody reads.
//
// Usage: node scripts/smoke/run-smoke.cjs <name>   (name as in `npm run smoke:<name>`)

const { spawn, spawnSync } = require('child_process')

const name = process.argv[2]
if (!name) {
  console.error('[run-smoke] usage: node scripts/smoke/run-smoke.cjs <name>')
  process.exit(1)
}

// Above every individual smoke's own timer (the longest is wspersist at 90s), so
// this only fires when a smoke has genuinely wedged rather than pre-empting it.
// Overridable so the hang path can actually be exercised without a 5min wait.
const HARD_CAP_MS = Number(process.env.SMOKE_CAP_MS || 300000)

const child = spawn('npm', ['run', 'smoke:' + name], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe']
})

let out = ''
const tee = (stream) => (d) => {
  const s = d.toString()
  out += s
  stream.write(s) // stream live so CI logs read exactly as they did before
}
child.stdout.on('data', tee(process.stdout))
child.stderr.on('data', tee(process.stderr))

// child.pid is the SHELL npm runs in, not Electron. child.kill() reaps only the
// shell and leaves the real process alive holding our stdio pipes, so 'close'
// never fires and the wrapper hangs alongside it — which is the failure mode this
// cap exists to prevent. taskkill /T takes the whole tree; spawnSync so it has
// actually happened before we exit.
const killTree = () => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

// Decide here rather than falling through to 'close': after a hang there is no
// guarantee 'close' ever arrives.
const cap = setTimeout(() => {
  console.error(`[run-smoke] ${name}: FAIL — no verdict within ${HARD_CAP_MS / 1000}s (hung)`)
  killTree()
  process.exit(1)
}, HARD_CAP_MS)

child.on('error', (e) => {
  clearTimeout(cap)
  console.error(`[run-smoke] ${name}: could not start — ${e.message}`)
  process.exit(1)
})

child.on('close', (code) => {
  clearTimeout(cap)

  const passed = /RESULT: PASS/.test(out)
  const failed = /RESULT: FAIL/.test(out)

  if (failed || !passed) {
    const why = failed ? 'reported RESULT: FAIL' : 'printed no RESULT line (crashed before finishing?)'
    console.error(`[run-smoke] ${name}: FAIL — ${why} (exit code ${code})`)
    process.exit(1)
  }

  // Passed. Say so plainly, and if the process still died badly on the way out,
  // print that too — it's tolerated, not hidden. A change in how often this line
  // appears is worth someone's attention.
  if (code === 0) console.log(`[run-smoke] ${name}: PASS`)
  else console.log(`[run-smoke] ${name}: PASS — tolerated dirty exit (code ${code}) after the verdict`)
  process.exit(0)
})
