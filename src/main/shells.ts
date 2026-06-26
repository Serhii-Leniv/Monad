import { existsSync } from 'fs'
import { join } from 'path'

export interface ShellInfo {
  id: string
  label: string
  command: string
  args: string[]
}

/** Resolve an executable on PATH (Windows-aware extensions). */
function onPath(exe: string): string | null {
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  for (const dir of (process.env.PATH || '').split(sep)) {
    if (!dir) continue
    for (const ext of exts) {
      const full = join(dir, exe + ext)
      try {
        if (existsSync(full)) return full
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

export interface AgentCli {
  id: string
  label: string
  command: string
}

// Known AI coding-agent CLIs, in rough order of popularity.
const KNOWN_AGENTS: { id: string; label: string; bins: string[] }[] = [
  { id: 'claude', label: 'Claude Code', bins: ['claude'] },
  { id: 'codex', label: 'Codex', bins: ['codex'] },
  { id: 'gemini', label: 'Gemini', bins: ['gemini'] },
  { id: 'aider', label: 'Aider', bins: ['aider'] },
  { id: 'cursor', label: 'Cursor Agent', bins: ['cursor-agent'] },
  { id: 'opencode', label: 'opencode', bins: ['opencode'] },
  { id: 'qwen', label: 'Qwen Code', bins: ['qwen'] }
]

/** Detect which agent CLIs are installed on PATH, so they can be launched in one click. */
export function detectAgents(): AgentCli[] {
  const out: AgentCli[] = []
  for (const a of KNOWN_AGENTS) {
    const bin = a.bins.find((b) => onPath(b))
    if (bin) out.push({ id: a.id, label: a.label, command: bin })
  }
  return out
}

/** Detect the shells/terminals actually installed on this machine. */
export function detectShells(): ShellInfo[] {
  const shells: ShellInfo[] = []

  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows'
    const psPath = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    shells.push({
      id: 'powershell',
      label: 'PowerShell',
      command: existsSync(psPath) ? psPath : 'powershell.exe',
      args: []
    })

    const pwsh =
      onPath('pwsh') ||
      (existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
        ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
        : null)
    if (pwsh) shells.push({ id: 'pwsh', label: 'PowerShell 7', command: pwsh, args: [] })

    shells.push({
      id: 'cmd',
      label: 'Command Prompt',
      command: join(sysRoot, 'System32', 'cmd.exe'),
      args: []
    })

    const gitBash = [
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe') : '',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
    ].find((p) => p && existsSync(p))
    if (gitBash) shells.push({ id: 'gitbash', label: 'Git Bash', command: gitBash, args: ['-l', '-i'] })

    const wsl = join(sysRoot, 'System32', 'wsl.exe')
    if (existsSync(wsl)) shells.push({ id: 'wsl', label: 'WSL', command: wsl, args: [] })
  } else {
    // macOS / Linux
    const seen = new Set<string>()
    const add = (id: string, label: string, command: string): void => {
      if (command && existsSync(command) && !seen.has(command)) {
        seen.add(command)
        shells.push({ id, label, command, args: [] })
      }
    }
    const sh = process.env.SHELL
    if (sh) add('default', `Default (${sh.split('/').pop()})`, sh)
    add('zsh', 'zsh', '/bin/zsh')
    add('bash', 'bash', '/bin/bash')
    add('bash-opt', 'bash', '/opt/homebrew/bin/bash')
  }

  return shells
}
