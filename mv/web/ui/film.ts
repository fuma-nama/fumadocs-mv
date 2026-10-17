import { at, FPS } from '../../src/engine/time';

export const CHAPTERS: Record<string, string> = {
  intro: 'Intro',
  read: 'Reading',
  toc: 'Table of contents',
  layout: 'Layouts',
  theme: 'Themes',
  cli: 'CLI',
  integrations: 'Integrations',
  showcase: 'Showcase',
  outro: 'Outro',
};

/** What each stretch of the film shows: its page on fumadocs.dev and that page's description. */
export const FEATURES: [start: number, title: string, path: string, about: string][] = [
  [0, 'What is Fumadocs', '/docs/what-is-fumadocs', 'Introducing Fumadocs, a docs framework that you can break.'],
  [at(10), 'Docs Layout', '/docs/ui/layouts/docs', 'The layout of documentation.'],
  [at(13), 'Markdown', '/docs/markdown', 'How to write documents.'],
  [at(15), 'Search UI', '/docs/ui/search', 'The UI for document search.'],
  [at(17), 'Table of Contents', '/docs/ui/layouts/page#table-of-contents', 'An overview of all the headings in your article.'],
  [at(25), 'Layouts', '/docs/ui/layouts', 'A list of layout components.'],
  [at(33), 'Themes', '/docs/ui/theme', 'Add Theme to Fumadocs UI.'],
  [at(41), 'CLI', '/docs/cli', 'The CLI tool that automates setups and installs components.'],
  [at(49), 'OpenAPI', '/docs/integrations/openapi', 'Generating docs for OpenAPI schema.'],
  [at(51), 'Obsidian', '/docs/integrations/content/obsidian', 'Render an Obsidian vault directly with Fumadocs.'],
  [at(53), 'Sanity', '/docs/integrations/content/sanity', 'Official integration for Sanity.'],
  [at(55), 'Story', '/docs/integrations/story', 'Display components with controls.'],
  [at(57), 'Showcase', '/showcase', 'Some cool websites using Fumadocs.'],
  [at(65), 'Quick Start', '/docs', 'Getting Started with Fumadocs.'],
];

/** The face each lyric style sets its line in (src/overlay/styles): the build ships only the glyphs the film draws. */
export const LYRIC_FACES: Record<string, string> = {
  verse: "600 14px/1.5 'Noto Serif JP'",
  vertical: "600 14px/1.5 'Noto Serif JP'",
  outro: "500 14px/1.5 'Noto Serif JP'",
  pre: "900 14px/1.5 'Zen Kaku Gothic New'",
  chorus: "900 14px/1.5 'Zen Kaku Gothic New'",
  final: "900 14px/1.5 'Zen Kaku Gothic New'",
  subtitle: "700 14px/1.5 'Zen Kaku Gothic New'",
  chant: '14px/1.5 DotGothic16',
};

export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const p2 = (n: number) => String(n).padStart(2, '0');
export const clockText = (t: number) => `${Math.floor(t / 60)}:${p2(Math.floor(t % 60))}`;
export const timecode = (f: number) => {
  const s = Math.floor(f / FPS);
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}:${p2(f % FPS)}`;
};
export const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
/** Text writes that skip unchanged values, so the 12 Hz panel updates touch the DOM only on change. */
export const put = (node: Node, text: string) => {
  if (node.textContent !== text) node.textContent = text;
};
