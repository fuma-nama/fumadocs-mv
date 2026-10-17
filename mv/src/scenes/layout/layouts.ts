/**
 * The six Fumadocs layouts. Geometry comes from the real captures (geo.ts, /plates/layouts);
 * this file holds the identities: order, labels, the package entry and which capture to use.
 */

export const VW = 1440;
export const VH = 900;

export type LayoutId = 'docs' | 'notebook' | 'flux' | 'glass' | 'spacious' | 'home' | 'notebook-auto' | 'notebook-tabs' | 'flux-open';

export interface LayoutDef {
  id: LayoutId;
  n: number;
  name: string;
  jp: string;
  code: string;
  /** capture id in /plates/layouts */
  geo: string;
}

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  docs: { id: 'docs', n: 1, name: 'DOCS', jp: 'ドキュメント', code: 'fumadocs-ui/layouts/docs', geo: 'docs' },
  notebook: { id: 'notebook', n: 2, name: 'NOTEBOOK', jp: 'ノートブック', code: 'fumadocs-ui/layouts/notebook', geo: 'notebook-top' },
  flux: { id: 'flux', n: 3, name: 'FLUX', jp: 'フラックス', code: 'fumadocs-ui/layouts/flux', geo: 'flux' },
  glass: { id: 'glass', n: 4, name: 'GLASS', jp: 'グラス', code: 'fumadocs-ui/layouts/glass', geo: 'glass' },
  spacious: { id: 'spacious', n: 5, name: 'SPACIOUS', jp: 'スペーシャス', code: 'fumadocs-ui/layouts/spacious', geo: 'spacious' },
  home: { id: 'home', n: 6, name: 'HOME', jp: 'ホーム', code: 'fumadocs-ui/layouts/home', geo: 'home' },
  // variants (shown in the rearrangement and the city)
  'notebook-auto': { id: 'notebook-auto', n: 2, name: 'NOTEBOOK', jp: 'ノートブック', code: 'fumadocs-ui/layouts/notebook', geo: 'notebook' },
  'notebook-tabs': { id: 'notebook-tabs', n: 2, name: 'NOTEBOOK', jp: 'ノートブック', code: 'fumadocs-ui/layouts/notebook', geo: 'notebook-navbar' },
  'flux-open': { id: 'flux-open', n: 3, name: 'FLUX', jp: 'フラックス', code: 'fumadocs-ui/layouts/flux', geo: 'flux-open' },
};

export const ORDER: LayoutId[] = ['docs', 'notebook', 'flux', 'glass', 'spacious', 'home'];
/** The city's cycle (bars 29–31): the six plus their variants. */
export const CYCLE: LayoutId[] = ['docs', 'notebook', 'flux', 'glass', 'spacious', 'home', 'notebook-auto', 'flux-open', 'notebook-tabs'];
