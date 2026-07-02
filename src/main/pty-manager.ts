import * as pty from '@homebridge/node-pty-prebuilt-multiarch'
import os from 'os'
import { randomUUID } from 'crypto'

export interface SpawnOptions {
  /** Executable to launch (defaults to the platform shell). */
  shell?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

type DataCb = (id: string, data: string) => void
type ExitCb = (id: string, code: number, signal?: number) => void

/**
 * Owns every live pseudo-terminal. One PtyManager per app; each agent card
 * gets one session keyed by a uuid. Data/exit are pushed out via callbacks so
 * the main process can forward them to the renderer over IPC.
 */
export class PtyManager {
  private sessions = new Map<string, pty.IPty>()

  constructor(private onData: DataCb, private onExit: ExitCb) {}

  spawn(opts: SpawnOptions): string {
    const id = randomUUID()
    const shell =
      opts.shell ||
      (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash')

    let proc: pty.IPty
    try {
      // xterm.js renders truecolor; advertise it. "xterm-color" claimed a
      // 16-colour terminal from the 90s and made agent CLIs (Claude Code,
      // aider…) silently degrade their palettes and TUI rendering.
      proc = pty.spawn(shell, opts.args ?? [], {
        name: 'xterm-256color',
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        cwd: opts.cwd || os.homedir(),
        env: {
          ...process.env,
          COLORTERM: 'truecolor',
          ...(opts.env ?? {})
        } as Record<string, string>
      })
    } catch (e) {
      // Surface to the renderer (the invoke promise rejects) so the card can
      // show an inline error + retry instead of hanging on a dead terminal.
      const reason = e instanceof Error ? e.message : String(e)
      throw new Error(`Could not start "${shell}": ${reason}`)
    }

    proc.onData((d) => this.onData(id, d))
    proc.onExit(({ exitCode, signal }) => {
      this.onExit(id, exitCode, signal)
      this.sessions.delete(id)
    })

    this.sessions.set(id, proc)
    return id
  }

  write(id: string, data: string): void {
    try {
      this.sessions.get(id)?.write(data)
    } catch {
      /* writing to a closed conpty/pipe throws (EPIPE/EPERM) — the process
         already exited; the exit handler will clean up. Ignore. */
    }
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.sessions.get(id)?.resize(cols, rows)
    } catch {
      /* resize on a dead pty throws on some platforms; ignore */
    }
  }

  kill(id: string): void {
    try {
      this.sessions.get(id)?.kill()
    } catch {
      /* killing an already-dead pty throws on Windows conpty; ignore */
    }
    this.sessions.delete(id)
  }

  killAll(): void {
    for (const proc of this.sessions.values()) {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    }
    this.sessions.clear()
  }
}
