import { C } from '../_shared/palette';

/** CLI section palette (docs/scenes/cli.md). */
export const P = {
  ...C,
  DESK: C.PAPER,
  DESK2: C.PAPER2,
  /** blueprint line blue (wallpaper drawing) */
  OCEAN: '#2357A8',
  /** active title bar */
  OCEAN_DEEP: '#1B3F7A',
  /** ocean-dark primary: the CLI's question colour (clack cyan) */
  SKY: '#8FD0FF',
  /** clack green text (messages) */
  MINT: '#93E2B4',
  /** terminal */
  TERM_BG: C.INK,
  TERM_FG: '#E8E6DF',
  TERM_DIM: '#6C7079',
  TERM_GRAY: '#474A52',
  CHIP: '#2C2F37',
} as const;

export type Ink = keyof typeof P | (string & {});
export const col = (k: Ink) => (k in P ? P[k as keyof typeof P] : k);
