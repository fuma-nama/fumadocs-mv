// CLI scene: ocean dark, 1600x900 @2x, the Themes page (same as themes/ocean-dark.png).
import { newPage, load, shot, record, writeJSON, log, rafs, settle } from '../lib.mjs';
import { captureLayout } from './layouts.mjs';
import { captureTheme, THEME_VP } from './themes.mjs';

export async function cliLayouts(browser) {
  for (const kind of ['docs', 'notebook', 'flux', 'glass', 'spacious', 'home']) {
    await captureLayout(browser, {
      kind,
      theme: 'ocean',
      mode: 'dark',
      vp: THEME_VP,
      group: 'cli',
      idPrefix: 'layout.',
      dirPrefix: 'cli/layouts',
      pagePath: 'themes',
      layers: false,
      note: 'CLI scene: the "Themes" page (same as themes/ocean-dark.png) in this layout, ocean dark, 1600x900.',
    });
  }
}

const STEPS = [
  { id: 'v1', v: 'sidebar', preset: 'ocean', label: 'restyled sidebar (tinted card, pill items, filled active item)' },
  { id: 'v2', v: 'sidebar,clerk', preset: 'ocean', label: 'v1 + TOC style clerk' },
  { id: 'v3', v: 'sidebar,clerk,banner', preset: 'ocean', label: 'v2 + rainbow Banner on top' },
  { id: 'v4', v: 'sidebar,clerk,banner,serif', preset: 'ocean', label: 'v3 + serif font (Source Serif 4)' },
  { id: 'v5', v: 'sidebar,clerk,banner,serif', preset: 'purple', label: 'v4 in purple dark' },
  { id: 'v6', v: 'sidebar,clerk,banner,serif', preset: 'emerald', label: 'v4 in emerald dark' },
  { id: 'v7', v: 'sidebar,clerk,banner,serif', preset: 'ruby', label: 'v4 in ruby dark' },
  { id: 'v8', v: 'sidebar,clerk,banner,serif', preset: 'catppuccin', label: 'v4 in catppuccin dark' },
];

export async function cliVariants(browser) {
  for (const s of STEPS) {
    const entry = await captureTheme(browser, {
      preset: s.preset,
      mode: 'dark',
      query: `?v=${s.v}`,
      group: 'cli',
      id: `variant.${s.id}`,
      dir: 'cli/variants',
    });
    entry.variant = { id: s.id, v: s.v.split(','), label: s.label };
    record('cli', `variant.${s.id}`, { ...entry, notes: `Cumulative customisation ${s.id}: ${s.label}. Same page/viewport/scroll as themes/ocean-dark.png. The Banner (v3+) pushes the layout down by 48px (3rem).` });
  }
  // one-change variants too (for region composites)
  for (const [id, v, label] of [['sidebar', 'sidebar', 'restyled sidebar only'], ['toc-clerk', 'clerk', 'TOC clerk only'], ['banner', 'banner', 'Banner only'], ['serif', 'serif', 'serif font only'], ['mono', 'mono', 'mono font only']]) {
    const entry = await captureTheme(browser, { preset: 'ocean', mode: 'dark', query: `?v=${v}`, group: 'cli', id: `single.${id}`, dir: 'cli/variants' });
    record('cli', `single.${id}`, { ...entry, variant: { id, v: [v], label }, notes: `One-change variant: ${label}.` });
  }
}

/** crop of the real Files component (Introduction > Make it yours), ocean dark */
export async function cliFiles(browser) {
  const page = await newPage(browser, { ...THEME_VP, mode: 'dark' });
  const url = '/themes/ocean/getting-started/introduction';
  await load(page, url);
  const files = page.locator('#make-it-yours ~ div.not-prose, #make-it-yours ~ div:has(> div > button)').first();
  const handle = await page.evaluateHandle(() => {
    const h = document.getElementById('make-it-yours');
    let el = h.nextElementSibling;
    while (el && !(el.textContent.includes('index.tsx') && el.textContent.includes('sidebar.tsx'))) el = el.nextElementSibling;
    el.scrollIntoView({ block: 'center' });
    return el;
  });
  await rafs(page, 3);
  await settle(page);
  const box = await page.evaluate((el) => window.__plates.box(el, { text: window.__plates.text(el) }), handle);
  const rows = await page.evaluate((el) => [...el.querySelectorAll('button, p, a, div > span')].filter((r) => r.getBoundingClientRect().height > 0 && r.children.length < 4).map((r) => window.__plates.box(r, { text: window.__plates.text(r) })), handle);
  const [x, y, w, h] = box.css;
  const file = await shot(page, 'cli/files/files.png', { clip: { x: x - 8, y: y - 8, width: w + 16, height: h + 16 } });
  const frame = await shot(page, 'cli/files/frame.png');
  writeJSON('cli/files/boxes.json', { box, rows, clipOrigin: [x - 8, y - 8] });
  await page.context().close();
  record('cli', 'files', { kind: 'crop', path: file, frame, url, dpr: 2, viewport: [THEME_VP.width, THEME_VP.height], theme: 'ocean', mode: 'dark', boxes: 'cli/files/boxes.json', notes: 'The real Files component (components/layout/docs/{index.tsx,page.tsx,slots/{sidebar,header}.tsx}) from the hero page, crop with 8px margin; frame.png = full viewport at that scroll.' });
  void files;
  log('cli files');
}
