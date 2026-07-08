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
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const IconClose = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconRefresh = ({ size = 15 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" />
    <path d="M20 3.5V8.5h-5" />
  </Svg>
)

/** Card-width toggle: arrows pushing outward → "make this card wider". */
export const IconWide = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M3.5 12h17" />
    <path d="M7 8.5L3.5 12 7 15.5" />
    <path d="M17 8.5l3.5 3.5-3.5 3.5" />
  </Svg>
)

/** Card-width toggle: arrows pulling inward → "back to normal width". */
export const IconNarrow = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M3.5 12H10M20.5 12H14" />
    <path d="M6.5 8.5L10 12l-3.5 3.5" />
    <path d="M17.5 8.5L14 12l3.5 3.5" />
  </Svg>
)

export const IconSend = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d="M20 4L4.5 10.5l6 2.5 2.5 6L20 4z" />
    <path d="M10.5 13L20 4" />
  </Svg>
)

/** Command-palette glyph: the ⌘ looped-square (recognisable on every platform). */
export const IconCommand = (): JSX.Element => (
  <Svg>
    <path d="M17.5 3.5a3 3 0 0 0-3 3v11a3 3 0 1 0 3-3h-11a3 3 0 1 0 3 3v-11a3 3 0 1 0-3 3h11a3 3 0 1 0-3-3z" />
  </Svg>
)

export const IconBell = (): JSX.Element => (
  <Svg>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
)
