import type { ReactNode } from 'react'

/**
 * The icon set.
 *
 * These used to be Feather/Lucide geometry transcribed by hand — round caps,
 * round joins, rounded rectangles. Redrawing the usual shapes does not make
 * them yours; they still read as the generic outline pack, and an icon that
 * could sit on any other product unchanged is not iconography.
 *
 * So the set has three house rules, and every glyph below follows them:
 *
 * 1. BUTT CAPS, MITRE JOINS. An engraved line is cut, not drawn with a round
 *    nib — it ends square and turns sharp. This is the most visible departure
 *    from the pack look and it survives all the way down to 14px.
 *
 * 2. ONE CHAMFERED CORNER, always bottom-right, always 3 units. It marks the
 *    icon's ENCLOSING form — not every shape inside it — so a composition made
 *    of parts (the grid, the columns) gets a single chamfer at the composition's
 *    own bottom-right. This is the icon-scale relative of the seam: the cut that
 *    says a thing is sealed. Bottom-right rather than top-left because tabs,
 *    prompts and detail almost always live top-left, and the two would collide.
 *
 * 3. SQUARE NODES. Anywhere the set needs a point — branch commits, slider
 *    handles — it is a square, never a circle. A node is a cell.
 *
 * Stroke is 1.5 on a 24 grid with shapes inset to 3, so at 16px render the
 * strokes land close to whole pixels instead of straddling two.
 *
 * The one deliberate exception is IconCommand: ⌘ is a letterform the OS itself
 * uses, not an icon, and redrawing it in a house style would make it stop
 * meaning what it means.
 */
function Svg({ children, size = 19 }: { children: ReactNode; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  )
}

/** Tab top-left, chamfer bottom-right. */
const FOLDER_PATH = 'M3 8V4.5h6L11 8h10v8.5L17.5 20H3z'

export const IconFolder = (): JSX.Element => (
  <Svg>
    <path d={FOLDER_PATH} />
  </Svg>
)

/** Folder glyph sized like the header/rail buttons (IconFolder is fixed 19px). */
export const IconFiles = ({ size = 14 }: { size?: number }): JSX.Element => (
  <Svg size={size}>
    <path d={FOLDER_PATH} />
  </Svg>
)

export const IconPlus = (): JSX.Element => (
  <Svg>
    <path d="M12 4.5v15M4.5 12h15" />
  </Svg>
)

/* Four cells; the chamfer belongs to the composition, so only the bottom-right
   cell carries it. */
export const IconGrid = (): JSX.Element => (
  <Svg>
    <path d="M3.5 3.5h7v7h-7z" />
    <path d="M13.5 3.5h7v7h-7z" />
    <path d="M3.5 13.5h7v7h-7z" />
    <path d="M13.5 13.5h7v4.5L18 20.5h-4.5z" />
  </Svg>
)

export const IconColumns = (): JSX.Element => (
  <Svg>
    <path d="M3.5 3.5h6v17h-6z" />
    <path d="M14.5 3.5h6v13.5L17 20.5h-2.5z" />
  </Svg>
)

export const IconTerminal = (): JSX.Element => (
  <Svg>
    <path d="M3 4.5h18v11L17.5 19.5H3z" />
    <path d="M6.5 9l2.5 2.5-2.5 2.5M12 14h5" />
  </Svg>
)

/* Commits are squares, not circles — a node is a cell. */
export const IconBranch = (): JSX.Element => (
  <Svg>
    <path d="M5 4.5h3.5V8H5zM5 16h3.5v3.5H5zM15.5 6.5H19V10h-3.5z" />
    <path d="M6.75 8v8M17.25 10c0 3.5-4.5 4.25-8.5 5.5" />
  </Svg>
)

export const IconFit = (): JSX.Element => (
  <Svg>
    <path d="M3.5 9V3.5H9M20.5 9V3.5H15M3.5 15v5.5H9M20.5 15v5.5H15" />
  </Svg>
)

/* A gear, because it reads faster than anything else — but drawn to the house
   rules rather than transcribed. Eight teeth on a strict 45° division with flat
   tips and hard mitred flanks, where the pack version is a twelve-tooth cog
   with rounded everything. The hub is a square: a node is a cell. */
export const IconSettings = (): JSX.Element => (
  <Svg>
    <path d="M9.21 5.26L10.15 2.48L13.85 2.48L14.79 5.26L17.42 3.96L20.04 6.58L18.74 9.21L21.52 10.15L21.52 13.85L18.74 14.79L20.04 17.42L17.42 20.04L14.79 18.74L13.85 21.52L10.15 21.52L9.21 18.74L6.58 20.04L3.96 17.42L5.26 14.79L2.48 13.85L2.48 10.15L5.26 9.21L3.96 6.58L6.58 3.96L9.21 5.26Z" />
    <path d="M9.6 9.6h4.8v4.8H9.6z" />
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
    <path d="M20.5 3.5L4 10.5l6 2.5 2.5 6z" />
    <path d="M10 13L20.5 3.5" />
  </Svg>
)

/**
 * Command-palette glyph. Deliberately outside the house rules: ⌘ is a
 * letterform the OS itself uses, and squaring its loops would stop it meaning
 * what it means.
 */
export const IconCommand = (): JSX.Element => (
  <Svg>
    <path
      d="M17.5 3.5a3 3 0 0 0-3 3v11a3 3 0 1 0 3-3h-11a3 3 0 1 0 3 3v-11a3 3 0 1 0-3 3h11a3 3 0 1 0-3-3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)

export const IconBell = (): JSX.Element => (
  <Svg>
    <path d="M6 9.5a6 6 0 0 1 12 0V15l2 3.5H4L6 15z" />
    <path d="M10 18.5v.5a2 2 0 0 0 4 0v-.5" />
  </Svg>
)
