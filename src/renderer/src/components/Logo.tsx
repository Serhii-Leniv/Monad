import logoUrl from '../assets/logo.png'

/** The emblem — a liquid-glass organic mark (text-free). */
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
