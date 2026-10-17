import type * as THREE from 'three';

/** css-px rect */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectOf = (a: number[]): Rect => ({ x: a[0], y: a[1], w: a[2], h: a[3] });

/** Real plate layers (plates/out/read/orange-light/layers), cropped to their region. */
export type LayerId = 'background' | 'sidebar.bg' | 'sidebar.header' | 'sidebar.search' | 'sidebar.tree' | 'sidebar.footer' | 'breadcrumb' | 'page.header' | 'article.body' | 'toc';

export interface Block {
  kind: string;
  /** document coords (viewport x) */
  rect: Rect;
  id?: string;
  text?: string;
  lines?: Rect[];
  /** code blocks: copy button; tabs/codetabs: tab list */
  copy?: Rect;
  list?: Rect;
  tabs?: Rect[];
  steps?: Rect[];
  cards?: Rect[];
  /** code blocks: source lines */
  code?: string[];
}

export interface Heading {
  id: string;
  text: string;
  depth: number;
  top: number;
  height: number;
  /** scrollY range in which the heading counts as active (≥ 90 % visible) */
  range: [number, number];
}

export interface PageModel {
  vw: number;
  vh: number;
  dpr: number;
  /** crop rect of each layer (viewport css) */
  layers: Record<LayerId, Rect>;
  columnX: number;
  columnW: number;
  docH: number;
  blocks: Block[];
  headings: Heading[];
  /** TOCItems container origin (viewport css) */
  tocOrigin: [number, number];
  tocBox: Rect;
  search: { trigger: Rect; kbd: Rect[] };
  sidebarItems: { text: string; rect: Rect; active: boolean; kind: string }[];
  breadcrumb: Rect;
  h1: Rect;
  desc: Rect;
  actions: Rect;
  /** scrollY after Enter on the "Table of Contents" search result */
  targetScroll: number;
  colors: { bg: string; card: string; primary: string; muted: string; fg: string; border: string };
}

export interface Tex {
  tex: THREE.Texture;
  /** css rect covered by the texture (viewport coords for layers, document coords for tiles) */
  rect: Rect;
}

export interface PageAssets {
  model: PageModel;
  frame: Tex;
  layers: Record<LayerId, Tex>;
  /** article column tiles (alpha), document coords */
  tiles: Tex[];
  /** crops of article blocks for the forest, keyed by block index; line crops by `${i}:${line}` */
  crops: Map<string, Tex>;
}
