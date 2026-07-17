import logoUrl from '../assets/logo.png'

/** The emblem — a black geometric "M" monogram with a top-right dot on a white tile. */
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
