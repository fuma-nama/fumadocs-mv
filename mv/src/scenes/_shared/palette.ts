/** Film palette (see docs/treatment.md §2). */
export const C = {
  INK: '#0A0A0B',
  INK2: '#151518',
  INK3: '#26262C',
  GREY: '#7C7C84',
  PAPER: '#EEECE4',
  PAPER2: '#E0DDD3',
  WHITE: '#FAFAF7',
  ORANGE: '#FA8023',
  EMBER: '#DF3F00',
  SUN: '#FFF383',
  BRAND: '#DD7627',
} as const;

import { ORDER, tokens, type Mode, type ThemeId } from './theme-tokens';

/**
 * Fumadocs colour presets, exact (from packages/base-ui/css via ./theme-tokens — full token sets,
 * parsing/conversion helpers live there). THEMES[id][mode] = { bg, fg, primary } as CSS strings.
 */
export const THEMES = Object.fromEntries(
  ORDER.map((id) => [
    id,
    Object.fromEntries(
      (['light', 'dark'] as Mode[]).map((m) => {
        const t = tokens(id, m);
        return [m, { bg: t.background, fg: t.foreground, primary: t.primary }];
      }),
    ),
  ]),
) as Record<ThemeId, Record<Mode, { bg: string; fg: string; primary: string }>>;
export type ThemeName = ThemeId;
export { ORDER as THEME_ORDER };
