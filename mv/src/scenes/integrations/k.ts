import { at, BEAT } from '../../engine/time';

/** Snap to the exact frame time (frame / 60) so `t >= T.x` holds on the very frame of a cue. */
export const fr = (x: number) => Math.round(x * 60) / 60;

/** Section timing (s). Blocks are 2 bars; CONV = bar 56 beat 3. */
export const T = {
  stop: fr(at(48, 4)), // 76.4 — cli's held caret
  drop: fr(at(49)), // 76.8 — 01 OpenAPI
  obs: fr(at(51)), // 80.0 — 02 Obsidian
  san: fr(at(53)), // 83.2 — 03 Sanity
  sto: fr(at(55)), // 86.4 — 04 Story
  reveal: fr(at(56, 2)), // 88.4 — pull-out reveal of the whole ring
  conv: fr(at(56, 3)), // 88.8 — fill: outputs arrive on 16ths; 89.2–89.6 stop
  end: fr(at(57)), // 89.6 — showcase downbeat
} as const;

export { BEAT };
/** n-th beat (1-indexed, fractional OK) of a block starting at t0 (frame-exact). */
export const bt = (t0: number, n: number) => fr(t0 + (n - 1) * BEAT);

/** Key colour per block (the packet itself stays ORANGE). */
export const KEY = {
  openapi: '#C6F432',
  obsidian: '#9D7BFF',
  obsidianDeep: '#5B34E0',
  sanity: '#FF4F6E',
  story: '#38D9F5',
} as const;

/** Flat saturated sky field per block (floods on its downbeat). Accents drawn over it use INK. */
export const FIELD = {
  openapi: '#A2CC17',
  obsidian: '#6B47F2',
  sanity: '#E8385C',
  story: '#18B3D2',
} as const;

export const ORANGE = '#FA8023';
export const INK = '#0A0A0B';

// ── world geometry ──────────────────────────────────────────────────────────
/** ring radius (world units = px at zoom 1) */
export const R = 1800;
/** horizon (ring tangent) in station-local px */
export const YH = 880;
/** settled camera height of the screen centre above the ring */
export const H0 = YH - 540;
const D = Math.PI / 180;
export const DEG = D;

export interface StationDef {
  id: 'openapi' | 'obsidian' | 'sanity' | 'story';
  n: string;
  name: string;
  pkg: string;
  jp: string;
  key: string;
  field: string;
  /** ring angle (rad, math convention, y up) */
  a: number;
  t0: number;
}

export const STATIONS: StationDef[] = [
  { id: 'openapi', n: '01', name: 'OPENAPI', pkg: 'fumadocs-openapi', jp: 'API仕様 → リファレンス', key: KEY.openapi, field: FIELD.openapi, a: 180 * D, t0: T.drop },
  { id: 'obsidian', n: '02', name: 'OBSIDIAN', pkg: 'fumadocs-obsidian', jp: '保管庫 → ドキュメント', key: KEY.obsidian, field: FIELD.obsidian, a: 90 * D, t0: T.obs },
  { id: 'sanity', n: '03', name: 'SANITY', pkg: '@fumadocs/sanity', jp: '構造化コンテンツ → ページ', key: KEY.sanity, field: FIELD.sanity, a: 0, t0: T.san },
  { id: 'story', n: '04', name: 'STORY', pkg: '@fumadocs/story', jp: 'コンポーネント × コントロール', key: KEY.story, field: FIELD.story, a: -90 * D, t0: T.sto },
];

/** launch point "00" on the ring (rad) */
export const A_LAUNCH = 240 * D;

/** Ring angle of the point under station-local x (on the true ring, not the tangent). */
export function ringAngleAtLocalX(a: number, x: number) {
  return a - Math.asin((x - 960) / R);
}
/** Station-local y of the ring under local x. */
export function ringLocalY(x: number) {
  const dx = x - 960;
  return YH + R - Math.sqrt(R * R - dx * dx);
}
