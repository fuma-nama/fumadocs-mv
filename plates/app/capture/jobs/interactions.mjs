// READ extras + interaction sequences on the hero page (Docs layout, orange light, 1440x810 @2x)
import { newPage, load, shot, record, writeJSON, log, rafs, settle, layer, finishAnimations } from '../lib.mjs';
import { READ_VP, HERO } from './read.mjs';
import { seekSequence } from './toc.mjs';
import { docsBoxes, activeRanges } from './docs-common.mjs';

const URL = (theme = 'orange') => `/themes/${theme}/${HERO}`;

async function scrollToEl(page, selector, offset = 160) {
  await page.evaluate(({ selector, offset }) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : null;
    window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset));
  }, { selector, offset });
  await rafs(page, 3);
  await page.waitForTimeout(150);
  await settle(page);
}

async function rectOf(page, selector) {
  return page.evaluate((s) => window.__plates.box(document.querySelector(s)), selector);
}

/** mark interesting blocks of the hero page with data-plate attributes */
async function markBlocks(page) {
  await page.evaluate(() => {
    const prose = document.querySelector('#nd-page .prose');
    const figs = [...prose.querySelectorAll('figure.shiki')];
    const cfg = figs.find((f) => f.textContent.includes('source.config.ts'));
    cfg?.setAttribute('data-plate', 'code-config');
    const tabs = [...prose.querySelectorAll(':scope > div')].find((d) => d.querySelector('[role=tablist]') && d.textContent.includes('React Router'));
    tabs?.setAttribute('data-plate', 'tabs');
    const npm = [...prose.querySelectorAll('[role=tablist]')].find((t) => t.textContent.includes('pnpm'))?.parentElement;
    npm?.setAttribute('data-plate', 'npm-tabs');
    prose.querySelector('.fd-steps')?.setAttribute('data-plate', 'steps');
    const callout = [...prose.querySelectorAll(':scope > div.rounded-xl.border.bg-fd-card')].find((c) => c.textContent.includes('Requirements'));
    callout?.setAttribute('data-plate', 'callout-info');
    const warn = [...prose.querySelectorAll(':scope > div.rounded-xl.border.bg-fd-card')].find((c) => c.textContent.includes('Bundle size'));
    warn?.setAttribute('data-plate', 'callout-warn');
    const cards = [...prose.querySelectorAll(':scope > div')].find((d) => d.querySelector('[data-card]') && d.textContent.includes('Notebook'));
    cards?.setAttribute('data-plate', 'cards-layouts');
    const files = [...prose.querySelectorAll(':scope > div')].find((d) => d.textContent.includes('sidebar.tsx') && d.textContent.includes('index.tsx'));
    files?.setAttribute('data-plate', 'files');
    const tt = [...prose.querySelectorAll(':scope > div')].find((d) => d.textContent.startsWith('PropType'));
    tt?.setAttribute('data-plate', 'typetable');
  });
}

/** READ extras: tabs states, code block copy states, DPR-4 close-ups */
export async function readExtras(browser, { theme = 'orange', mode = 'light' } = {}) {
  const dir = `read/${theme}-${mode}/extras`;
  const page = await newPage(browser, { ...READ_VP, mode });
  await load(page, URL(theme));
  await markBlocks(page);
  const out = {};

  // Tabs: 3 states, same crop
  await scrollToEl(page, '[data-plate=tabs]', 300);
  const tb = await rectOf(page, '[data-plate=tabs]');
  const tclip = { x: tb.css[0] - 8, y: tb.css[1] - 8, width: tb.css[2] + 16, height: tb.css[3] + 16 };
  out.tabs = { clip: [tclip.x, tclip.y, tclip.width, tclip.height], scrollY: await page.evaluate(() => scrollY), states: {} };
  for (const name of ['Next.js', 'React Router', 'Tanstack Start']) {
    await page.locator('[data-plate=tabs] [role=tab]', { hasText: name }).click();
    await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await rafs(page, 2);
    await finishAnimations(page);
    const b = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('[data-plate=tabs] [role=tab]')].map((t) => window.__plates.box(t, { text: window.__plates.text(t), selected: t.getAttribute('aria-selected') === 'true' })), panel: window.__plates.box([...document.querySelectorAll('[data-plate=tabs] [role=tabpanel]')].find((p) => !p.hidden)) }));
    const id = name.toLowerCase().replace(/[^a-z]+/g, '-');
    out.tabs.states[id] = { still: await shot(page, `${dir}/tabs-${id}.png`, { clip: tclip }), ...b };
  }
  await page.locator('[data-plate=tabs] [role=tab]', { hasText: 'Next.js' }).click();
  await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);

  // Code block copy button: idle / hover block / hover button / copied
  await scrollToEl(page, '[data-plate=code-config]', 200);
  const cb = await rectOf(page, '[data-plate=code-config]');
  const cclip = { x: cb.css[0] - 8, y: cb.css[1] - 8, width: cb.css[2] + 16, height: cb.css[3] + 16 };
  const btn = page.locator('[data-plate=code-config] button[aria-live]');
  const bb = await btn.boundingBox();
  out.copy = { clip: [cclip.x, cclip.y, cclip.width, cclip.height], button: bb, states: {} };
  const cap = async (id) => {
    await rafs(page, 2);
    await finishAnimations(page);
    out.copy.states[id] = await shot(page, `${dir}/copy-${id}.png`, { clip: cclip });
  };
  await cap('idle');
  await page.mouse.move(cb.css[0] + 200, cb.css[1] + 150);
  await cap('hover-block');
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(150);
  await cap('hover-button');
  // pressed, then copied (the check icon reverts after ~1.5 s real time, so capture right away)
  await page.mouse.down();
  await rafs(page, 2);
  out.copy.states.pressed = await shot(page, `${dir}/copy-pressed.png`, { clip: cclip });
  await page.mouse.up();
  await rafs(page, 2);
  out.copy.states.copied = await shot(page, `${dir}/copy-copied.png`, { clip: cclip });
  await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);
  await rafs(page, 2);
  out.copy.states['copied-mouse-away'] = await shot(page, `${dir}/copy-copied-mouse-away.png`, { clip: cclip });
  out.copy.note = 'Clicking swaps the Clipboard icon for a Check (no animation besides a 100 ms colour transition) for ~1.5 s, then it swaps back.';
  await page.context().close();

  // DPR 4 alpha close-ups
  const p4 = await newPage(browser, { ...READ_VP, dpr: 4, mode });
  await load(p4, URL(theme));
  await markBlocks(p4);
  const closeups = {};
  for (const [id, sel, offset] of [
    ['code-config', '[data-plate=code-config]', 200],
    ['npm-tabs', '[data-plate=npm-tabs]', 200],
    ['callout-info', '[data-plate=callout-info]', 300],
    ['callout-warn', '[data-plate=callout-warn]', 300],
    ['cards-layouts', '[data-plate=cards-layouts]', 120],
    ['tabs', '[data-plate=tabs]', 300],
    ['steps', '[data-plate=steps]', 60],
    ['files', '[data-plate=files]', 120],
    ['typetable', '[data-plate=typetable]', 200],
  ]) {
    await scrollToEl(p4, sel, offset);
    const r = await rectOf(p4, sel);
    const clip = { x: r.css[0] - 4, y: Math.max(0, r.css[1] - 4), width: r.css[2] + 8, height: Math.min(r.css[3] + 8, READ_VP.height) };
    closeups[id] = { box: r, file: await layer(p4, `${dir}/closeups/${id}.png`, { show: [sel], clip }), opaque: await shot(p4, `${dir}/closeups/${id}.opaque.png`, { clip }) };
  }
  await p4.evaluate(() => window.scrollTo(0, 0));
  await rafs(p4, 2);
  await settle(p4);
  for (const [id, sel] of [['toc', '#nd-toc'], ['search-trigger', '#nd-sidebar button[data-search-full]'], ['sidebar', '#nd-sidebar'], ['logo', '#nd-sidebar > div:first-child > div:first-child > a']]) {
    const r = await rectOf(p4, sel);
    const clip = { x: Math.max(0, r.css[0] - 4), y: Math.max(0, r.css[1] - 4), width: r.css[2] + 8, height: Math.min(r.css[3] + 8, READ_VP.height) };
    closeups[id] = { box: r, file: await layer(p4, `${dir}/closeups/${id}.png`, { show: [sel], clip }), opaque: await shot(p4, `${dir}/closeups/${id}.opaque.png`, { clip }) };
  }
  await p4.context().close();
  out.closeups = closeups;
  record('read', `extras.${theme}.${mode}`, {
    kind: 'states+closeups',
    css: [READ_VP.width, READ_VP.height],
    dpr: 2,
    closeupDpr: 4,
    theme,
    mode,
    url: URL(theme),
    ...out,
    notes: 'tabs: the [Next.js, React Router, Tanstack Start] Tabs block in 3 states (same clip). copy: the source.config.ts code block idle / hover-block / hover-button / copied (+ copy-click/ 60 fps from the click, real transition length), same clip. closeups: DPR 4 crops (alpha via layer isolation, and .opaque.png with the page background), clip = element rect + 4px; clips are in CSS px at the scroll used for that crop.',
  });
  log('read extras');
}

/** TOC layer + active list when jumping to each heading (scrollY = heading - 112, like the hash jump) */
export async function readTocStates(browser, { theme = 'orange', mode = 'light' } = {}) {
  const page = await newPage(browser, { ...READ_VP, mode });
  await load(page, URL(theme));
  const dir = `read/${theme}-${mode}/toc-states`;
  const boxes = await docsBoxes(page);
  const ranges = activeRanges(boxes, READ_VP.height);
  const states = [];
  for (const h of ranges) {
    const y = Math.max(0, Math.round(h.top - 112));
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await rafs(page, 3);
    await page.waitForTimeout(120);
    await settle(page);
    const info = await page.evaluate(() => ({
      scrollY,
      active: [...document.querySelectorAll('#nd-toc a[data-active=true]')].map((a) => a.getAttribute('href')),
      thumb: (() => {
        const t = window.__plates.tocGeometry(document.querySelector('#nd-toc'))?.thumb;
        return t && { trackTop: t.trackTop, trackBottom: t.trackBottom, offsetDistance: t.offsetDistance, dot: t.dot?.rect };
      })(),
    }));
    states.push({ heading: h.id, ...info, toc: await layer(page, `${dir}/${h.id}.png`, { show: ['#nd-toc'] }) });
  }
  await page.context().close();
  record('read', `toc-states.${theme}.${mode}`, {
    kind: 'layers',
    css: [READ_VP.width, READ_VP.height],
    dpr: 2,
    theme,
    mode,
    url: URL(theme),
    states,
    notes: 'For every heading: the TOC layer (alpha, full frame) after jumping to it (scrollY = heading top - 112 = scroll-margin, as a hash link / search result does), with the real active set and thumb variables. Default (range) mode: several headings can be active when they are all on screen.',
  });
  log('read toc states', states.length);
}

/** interaction sequences: theme toggle, sidebar folder, (copy click is in readExtras) */
export async function interactions(browser, { theme = 'orange', mode = 'light' } = {}) {
  const dir = `interactions/${theme}-${mode}`;
  const out = {};
  // light -> dark toggle
  {
    const page = await newPage(browser, { ...READ_VP, mode: 'light' });
    await load(page, URL(theme));
    const before = await shot(page, `${dir}/theme-toggle/before.png`);
    const toggle = await page.evaluate(() => window.__plates.box(document.querySelector('#nd-sidebar [data-theme-toggle]')));
    const svgs = await page.evaluate(() => [...document.querySelectorAll('#nd-sidebar [data-theme-toggle] svg')].map((s) => window.__plates.box(s)));
    const dark = svgs[1].css;
    const seq = await seekSequence(page, {
      trigger: () => page.mouse.click(dark[0] + dark[2] / 2, dark[1] + dark[3] / 2),
      count: 30,
      pattern: `${dir}/theme-toggle/seq/%04d.png`,
    });
    await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);
    await page.waitForTimeout(300);
    await settle(page);
    const after = await shot(page, `${dir}/theme-toggle/after.png`);
    out.themeToggle = { before, after, toggle, options: svgs, sequence: { pattern: `${dir}/theme-toggle/seq/%04d.png`, count: 30, fps: 60, durationMs: seq.durationMs, animations: seq.animations }, note: 'next-themes switches the class on <html> with transitions disabled for the change: the page flips in one frame (the sequence shows it). Hover state on the toggle is visible in the sequence frames.' };
    await page.context().close();
  }
  // sidebar folder expand / collapse (Layouts)
  {
    const page = await newPage(browser, { ...READ_VP, mode });
    await load(page, URL(theme));
    const folder = page.locator('#nd-sidebar button', { hasText: 'Layouts' }).first();
    const fb = await folder.boundingBox();
    const sb = await page.evaluate(() => window.__plates.box(document.querySelector('#nd-sidebar')));
    const clip = { x: 0, y: 0, width: sb.css[2], height: READ_VP.height };
    const closed = await shot(page, `${dir}/folder/closed.png`, { clip });
    const open = await seekSequence(page, {
      trigger: async () => {
        await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
        await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);
      },
      count: 36,
      pattern: `${dir}/folder/expand/%04d.png`,
      clip,
    });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.waitForTimeout(300);
    await settle(page);
    const opened = await shot(page, `${dir}/folder/open.png`, { clip });
    const items = await page.evaluate(() => window.__plates.sidebarItems(document.querySelector('#nd-sidebar [data-id^="base-ui"]')));
    const close = await seekSequence(page, {
      trigger: async () => {
        await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
        await page.mouse.move(READ_VP.width - 2, READ_VP.height - 2);
      },
      count: 36,
      pattern: `${dir}/folder/collapse/%04d.png`,
      clip,
    });
    out.folder = {
      clip: [clip.x, clip.y, clip.width, clip.height],
      closed,
      open: opened,
      itemsWhenOpen: items,
      expand: { pattern: `${dir}/folder/expand/%04d.png`, count: 36, fps: 60, durationMs: open.durationMs, stretch: +(600 / Math.max(1, open.durationMs)).toFixed(3), animations: open.animations },
      collapse: { pattern: `${dir}/folder/collapse/%04d.png`, count: 36, fps: 60, durationMs: close.durationMs, stretch: +(600 / Math.max(1, close.durationMs)).toFixed(3), animations: close.animations },
    };
    await page.context().close();
  }
  record('interactions', `${theme}.${mode}`, {
    kind: 'sequences',
    css: [READ_VP.width, READ_VP.height],
    dpr: 2,
    theme,
    mode,
    url: URL(theme),
    ...out,
    notes: 'Docs layout hero page. Sequences are the real CSS transitions sampled uniformly over `count` frames (stretch = how much they were slowed down). Search open/typing: see read["search.contents.orange.light"]; code block copy click: read["extras.orange.light"].copy.',
  });
  log('interactions');
}

/** TOC heading-to-heading sequences for normal / clerk / block (TOC column crop) */
export async function tocSequences(browser, { theme = 'orange', mode = 'light' } = {}) {
  const pairs = [['reading', 'table-of-contents'], ['table-of-contents', 'layouts'], ['layouts', 'glass'], ['glass', 'themes'], ['themes', 'integrations'], ['integrations', 'showcase']];
  for (const style of ['normal', 'clerk', 'block']) {
    const page = await newPage(browser, { ...READ_VP, mode });
    await load(page, `${URL(theme)}?toc=${style}`);
    const boxes = await docsBoxes(page);
    const heads = Object.fromEntries(activeRanges(boxes, READ_VP.height).map((r) => [r.id, r]));
    const toc = boxes.toc.box.css;
    const clip = { x: toc[0], y: toc[1], width: toc[2], height: toc[3] };
    const go = async (id) => {
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(heads[id].top - 112)));
      await rafs(page, 3);
      await page.waitForTimeout(100);
    };
    const seqs = [];
    for (const [a, b] of pairs) {
      await go(a);
      await settle(page);
      const from = await page.evaluate(() => [...document.querySelectorAll('#nd-toc a[data-active=true]')].map((x) => x.getAttribute('href')));
      const s = await seekSequence(page, { trigger: () => go(b), count: 72, pattern: `toc/seq/${style}-${theme}-${mode}/${a}__${b}/%04d.png`, clip });
      await settle(page);
      const to = await page.evaluate(() => [...document.querySelectorAll('#nd-toc a[data-active=true]')].map((x) => x.getAttribute('href')));
      seqs.push({ from: a, to: b, activeFrom: from, activeTo: to, pattern: `toc/seq/${style}-${theme}-${mode}/${a}__${b}/%04d.png`, count: 72, fps: 60, durationMs: s.durationMs, stretch: +(1200 / Math.max(1, s.durationMs)).toFixed(3), animations: s.animations.map((x) => `${x.name}:${x.duration}`) });
    }
    await page.context().close();
    record('toc', `seq.${style}.${theme}.${mode}`, {
      kind: 'sequences',
      tocStyle: style,
      theme: theme === 'orange' ? 'neutral (+ primary #FA8023)' : theme,
      mode,
      dpr: 2,
      viewport: [READ_VP.width, READ_VP.height],
      clip: [clip.x, clip.y, clip.width, clip.height],
      sequences: seqs,
      notes: 'TOC column crop (#nd-toc) while jumping from heading A to heading B (scroll = heading - 112). The real transition (normal/clerk 150 ms, block 300 ms) is sampled uniformly over 72 frames (= 1.2 s at 60 fps). The article jumps instantly (not visible in the crop).',
    });
    log('toc seq', style);
  }
}
