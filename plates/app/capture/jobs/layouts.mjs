// LAYOUT scene: the Quick Start page in every layout, 1440x900 @2x, neutral, dark (+ light).
import { newPage, load, shot, record, writeJSON, log, rafs, settle, layer } from '../lib.mjs';

export const LAYOUT_VP = { width: 1440, height: 900, dpr: 2 };
const PAGE = 'getting-started/quick-start';

export const KINDS = ['docs', 'notebook', 'notebook-top', 'notebook-navbar', 'flux', 'flux-open', 'glass', 'spacious', 'home'];

function urlFor(theme, kind, page = PAGE) {
  if (kind === 'docs') return `/themes/${theme}/${page}`;
  if (kind === 'home') return `/themes/${theme}/x/home`;
  if (kind === 'flux-open') return `/themes/${theme}/x/flux/${page}`;
  return `/themes/${theme}/x/${kind}/${page}`;
}

/** region layers per layout (alpha, full frame) */
function layersFor(kind) {
  const common = {
    background: { show: [], background: true },
    sidebar: { show: ['#nd-sidebar'] },
    article: { show: ['#nd-page'] },
    toc: { show: ['#nd-toc'] },
  };
  switch (kind) {
    case 'docs':
      return common;
    case 'notebook':
    case 'notebook-top':
    case 'notebook-navbar':
      return { ...common, header: { show: ['#nd-subnav'] } };
    case 'flux':
      return { background: common.background, article: common.article, panel: { show: ["div.fixed[class*='left-1/2']"] } };
    case 'flux-open':
      return { background: common.background, article: common.article, overlay: { show: ['div.fixed.inset-0[class*=backdrop-blur-md]'] }, panel: { show: ["div.fixed[class*='left-1/2']"] } };
    case 'glass':
      return { ...common, pills: { show: ["#fd-glass-layout > div.sticky[class*='justify-end']"] } };
    case 'spacious':
      return { background: common.background, sidebar: common.sidebar, panel: { show: ['#nd-page-panel'], keepChildren: false }, panelHeader: { show: ['#nd-page-panel > header'] }, article: common.article, toc: common.toc };
    case 'home':
      return { background: common.background, nav: { show: ['#nd-nav'] }, hero: { show: ['[data-plate=hero]'] } };
  }
}

export async function captureLayout(browser, { theme = 'neutral', mode = 'dark', kind, vp = LAYOUT_VP, group = 'layouts', idPrefix = '', dirPrefix = 'layouts', layers = true, query = '', pagePath = PAGE, note }) {
  const page = await newPage(browser, { ...vp, mode });
  const url = urlFor(theme, kind, pagePath) + query;
  await load(page, url);
  if (kind === 'flux-open') {
    await page.click('button[aria-label="Open Sidebar"]');
    await page.waitForTimeout(900);
    await settle(page);
    await page.mouse.move(vp.width - 2, 2);
    await page.waitForTimeout(200);
    await settle(page);
  }
  const name = `${kind}${mode === 'dark' ? '' : '.light'}`;
  const dir = `${dirPrefix}/${name}`;
  const frame = await shot(page, `${dirPrefix}/${name}.png`);
  const boxes = await page.evaluate(() => window.__plates.layoutBoxes());
  boxes.url = url;
  boxes.theme = theme;
  boxes.mode = mode;
  boxes.layout = kind;
  const boxesFile = writeJSON(`${dirPrefix}/${name}.boxes.json`, boxes);
  let layerFiles;
  if (layers) {
    layerFiles = {};
    for (const [n, spec] of Object.entries(layersFor(kind))) layerFiles[n] = await layer(page, `${dir}/layers/${n}.png`, spec);
  }
  await page.context().close();
  const entry = {
    kind: 'still+boxes' + (layers ? '+layers' : ''),
    path: frame,
    size: [vp.width * vp.dpr, vp.height * vp.dpr],
    css: [vp.width, vp.height],
    dpr: vp.dpr,
    layout: kind,
    theme,
    mode,
    url,
    scrollY: 0,
    boxes: boxesFile,
    layers: layerFiles,
    keyBoxes: {
      header: boxes.header,
      tabs: boxes.tabs,
      sidebar: boxes.sidebar?.box,
      logo: boxes.logo,
      search: boxes.search,
      tabDropdown: boxes.tabDropdown,
      article: boxes.article?.box,
      h1: boxes.article?.h1,
      description: boxes.article?.description,
      actions: boxes.article?.actions,
      toc: boxes.toc?.box,
      tocTitle: boxes.toc?.title,
      flux: boxes.flux,
      glass: boxes.glass,
      spacious: boxes.spacious,
      home: boxes.home,
    },
    notes: (note ? note + ' ' : '') + 'Scroll 0. Full boxes (sidebar items, article blocks, TOC items + geometry, tabs, controls) in the .boxes.json. Layers: alpha, full frame, stack over the opaque background layer.',
  };
  record(group, `${idPrefix}${name}`, entry);
  log(group, name);
  return entry;
}
