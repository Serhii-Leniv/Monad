import logoUrl from '../assets/logo.png'

/** The emblem — Monad's spirograph mark, rendered white for the dark app UI. */
export default function Logo({ size = 26 }: { size?: number }): JSX.Element {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}
