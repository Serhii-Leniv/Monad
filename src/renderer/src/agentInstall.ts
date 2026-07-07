/** Install/docs URL per known agent-CLI binary (keys match the `bins` names in
 *  src/main/shells.ts, lowercase). Drives the "Install guide" action on the
 *  missing-command toast in TerminalPane; unknown binaries get no action. */
export const AGENT_INSTALL_URLS: Record<string, string> = {
  claude: 'https://docs.claude.com/en/docs/claude-code/overview',
  codex: 'https://developers.openai.com/codex/cli',
  gemini: 'https://github.com/google-gemini/gemini-cli',
  aider: 'https://aider.chat/docs/install.html',
  'cursor-agent': 'https://cursor.com/cli',
  opencode: 'https://opencode.ai',
  qwen: 'https://github.com/QwenLM/qwen-code'
}
