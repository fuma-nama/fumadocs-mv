// THEME scene: the "Themes" page in the Docs layout, every preset x light/dark, 1600x900 @2x.
import { newPage, load, shot, record, writeJSON, log, rafs, settle } from '../lib.mjs';
import { docsBoxes, activeRanges } from './docs-common.mjs';

export const THEME_VP = { width: 1600, height: 900, dpr: 2 };
export const PRESETS = ['neutral', 'black', 'vitepress', 'dusk', 'catppuccin', 'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen', 'shadcn'];

async function presetToken(page, preset) {
  return page.evaluate((preset) => {
    const P = window.__plates;
    const needle = `fumadocs-ui/css/${preset}.css`;
    const line = [...document.querySelectorAll('#nd-page figure.shiki .line')].find((l) => l.textContent.includes(needle));
    if (!line) return null;
    const span = [...line.querySelectorAll('span')].find((s) => s.children.length === 0 && s.textContent.includes(needle));
    const node = span?.firstChild;
    let token = null;
    if (node) {
      const start = node.textContent.indexOf(preset, node.textContent.indexOf('css/'));
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + preset.length);
      token = P.fromRect(range.getBoundingClientRect(), { text: preset, color: getComputedStyle(span).color });
    }
    return {
      line: P.box(line, { text: line.textContent }),
      stringToken: P.box(span, { text: span?.textContent, color: span ? getComputedStyle(span).color : undefined }),
      presetName: token,
      codeBlock: P.box(line.closest('figure')),
    };
  }, preset);
}

export async function captureTheme(browser, { preset, mode, scrollY = 0, vp = THEME_VP, page: pagePath = 'themes', group = 'themes', query = '', id, dir: dirOverride }) {
  const page = await newPage(browser, { ...vp, mode });
  const url = `/themes/${preset}/${pagePath}${query}`;
  await load(page, url);
  if (scrollY) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await rafs(page, 3);
    await page.waitForTimeout(200);
    await settle(page);
  }
  const name = id ?? `${preset}-${mode}${scrollY ? `.s${scrollY}` : ''}`;
  const base = dirOverride ?? group;
  const frame = await shot(page, `${base}/${name}.png`);
  const boxes = await docsBoxes(page);
  boxes.presetImport = await presetToken(page, preset);
  boxes.activeRanges = activeRanges(boxes, vp.height);
  const boxesFile = writeJSON(`${base}/${name}.boxes.json`, boxes);
  await page.context().close();
  const activeItem = boxes.sidebar?.items.find((i) => i.active);
  const tocActive = boxes.toc?.items.filter((i) => i.active);
  const entry = {
    kind: 'still+boxes',
    path: frame,
    size: [vp.width * vp.dpr, vp.height * vp.dpr],
    css: [vp.width, vp.height],
    dpr: vp.dpr,
    layout: 'docs',
    theme: preset,
    mode,
    tocStyle: 'normal',
    url,
    scrollY,
    activeToc: tocActive?.map((i) => i.href),
    boxes: boxesFile,
    colors: boxes.colors,
    keyBoxes: {
      sidebar: boxes.sidebar?.box,
      sidebarActiveItem: activeItem,
      search: boxes.sidebar?.search?.box,
      themeToggle: boxes.sidebar?.footer?.themeToggle,
      article: boxes.article.box,
      h1: boxes.header.h1,
      toc: boxes.toc?.box,
      tocActiveItems: tocActive,
      tocThumb: boxes.toc?.geometry?.thumb ? { ...boxes.toc.geometry.thumb.dot, containerCss: boxes.toc.geometry.container } : undefined,
      importLine: boxes.presetImport?.line,
      presetName: boxes.presetImport?.presetName,
    },
    notes:
      preset === 'solar'
        ? 'Solar is the only preset that changes layout: an inset article card (md: p-4 around the main column, rounded border + shadow) shifts the article ~16px right/down, and :root letter-spacing -0.25px. Boxes are measured per capture.'
        : 'Identical page, scroll, sidebar state and TOC state across presets; only colours differ (see colors). keyBoxes.tocThumb.rect is relative to keyBoxes.tocThumb.containerCss.',
  };
  record(group, name, entry);
  log(group, name);
  return entry;
}
