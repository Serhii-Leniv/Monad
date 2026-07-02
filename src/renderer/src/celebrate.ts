/**
 * A brief particle burst for the "agent's work landed" moment (merge success).
 * Pure DOM + CSS animation, removed after a second; hidden entirely under
 * prefers-reduced-motion (see .confetti in styles.css).
 */
export function celebrate(): void {
  const host = document.createElement('div')
  host.className = 'confetti'
  const colors = ['var(--accent)', '#30d158', '#ffd60a', '#64d2ff', '#bf5af2']
  const N = 26
  for (let i = 0; i < N; i++) {
    const p = document.createElement('i')
    const angle = (i / N) * Math.PI * 2 + Math.random() * 0.5
    const speed = 90 + Math.random() * 150
    p.style.setProperty('--dx', `${Math.cos(angle) * speed}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * speed - 60}px`)
    p.style.setProperty('--rz', `${Math.random() * 540 - 270}deg`)
    p.style.background = colors[i % colors.length]
    p.style.animationDelay = `${Math.random() * 60}ms`
    host.appendChild(p)
  }
  document.body.appendChild(host)
  setTimeout(() => host.remove(), 1100)
}
