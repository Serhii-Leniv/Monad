import type { ReactNode } from 'react'

function Svg({ children, size = 19 }: { children: ReactNode; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const IconFolder = (): JSX.Element => (
  <Svg>
    <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </Svg>
)

export const IconPlus = (): JSX.Element => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconGrid = (): JSX.Element => (
  <Svg>
    <rect x="4" y="4" width="7" height="7" rx="1.3" />
    <rect x="13" y="4" width="7" height="7" rx="1.3" />
    <rect x="4" y="13" width="7" height="7" rx="1.3" />
    <rect x="13" y="13" width="7" height="7" rx="1.3" />
  </Svg>
)

export const IconColumns = (): JSX.Element => (
  <Svg>
    <rect x="4" y="4" width="6" height="16" rx="1.3" />
    <rect x="14" y="4" width="6" height="16" rx="1.3" />
  </Svg>
)

export const IconTerminal = (): JSX.Element => (
  <Svg>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M7.5 10l2.5 2.5-2.5 2.5M12.5 15h4" />
  </Svg>
)

export const IconBranch = (): JSX.Element => (
  <Svg>
    <circle cx="6.5" cy="6" r="2" />
    <circle cx="6.5" cy="18" r="2" />
    <circle cx="17.5" cy="8" r="2" />
    <path d="M6.5 8v8M17.5 10c0 3.5-4 4-8 5" />
  </Svg>
)

export const IconFit = (): JSX.Element => (
  <Svg>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M20 9V5.5A1.5 1.5 0 0 0 18.5 4H15M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
  </Svg>
)

export const IconSettings = (): JSX.Element => (
  <Svg>
    <path d="M4 7h8M16.5 7H20M4 17h3.5M12 17h8" />
    <circle cx="14" cy="7" r="2.3" />
    <circle cx="9.5" cy="17" r="2.3" />
  </Svg>
)

export const IconClose = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconBell = (): JSX.Element => (
  <Svg>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
)
