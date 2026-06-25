/** The VECTRO mark: a cyan V / vector arrow with the active-agent dot. */
export default function Logo({ size = 26 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="258 258 284 284"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 280 280 L 400 520" stroke="var(--brand)" strokeWidth="36" strokeLinecap="round" />
      <path d="M 400 520 L 520 280" stroke="var(--brand)" strokeWidth="36" strokeLinecap="round" />
      <path
        d="M 462 280 L 520 280 L 520 338"
        stroke="var(--brand)"
        strokeWidth="36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="400" cy="520" r="17" fill="#0b0f17" stroke="var(--brand)" strokeWidth="13" />
    </svg>
  )
}
