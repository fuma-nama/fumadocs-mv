// READ scene: Docs layout hero page (Getting Started > Introduction), 1440x810 @2x.
import { newPage, load, shot, record, writeJSON, log, rafs, settle } from '../lib.mjs';
import { captureLayers, docsBoxes, activeRanges } from './docs-common.mjs';

export const READ_VP = { width: 1440, height: 810, dpr: 2 };
export const HERO = 'getting-started/introduction';

export async function readFrame(browser, { theme = 'orange', mode = 'light', layers = true } = {}) {
  const page = await newPage(browser, { ...READ_VP, mode });
  const url = `/themes/${theme}/${HERO}`;
  await load(page, url);
  const dir = `read/${theme}-${mode}`;
  log('read frame', dir);
  const frame = await shot(page, `${dir}/frame.png`);
  const boxes = await docsBoxes(page);
  boxes.activeRanges = activeRanges(boxes, READ_VP.height);
  boxes.documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const boxesFile = writeJSON(`${dir}/boxes.json`, boxes);
  let layerFiles;
  if (layers) layerFiles = await captureLayers(page, dir);
  const entry = {
    kind: 'still+layers',
    path: frame,
    size: [READ_VP.width * READ_VP.dpr, READ_VP.height * READ_VP.dpr],
    css: [READ_VP.width, READ_VP.height],
    dpr: READ_VP.dpr,
    layout: 'docs',
    theme: theme === 'orange' ? 'neutral (+ --color-fd-primary #FA8023)' : theme,
    mode,
    tocStyle: 'normal',
    url,
    scrollY: 0,
    activeToc: boxes.toc?.items.filter((i) => i.active).map((i) => i.href),
    layers: layerFiles,
    boxes: boxesFile,
    keyBoxes: {
      sidebar: boxes.sidebar?.box,
      search: boxes.sidebar?.search?.box,
      logo: boxes.sidebar?.logo,
      breadcrumb: boxes.breadcrumb?.box,
      h1: boxes.header.h1,
      article: boxes.article.box,
      toc: boxes.toc?.box,
      themeToggle: boxes.sidebar?.footer?.themeToggle,
    },
    notes:
      'Hero page. layers/*.png stack over frame.png (background is opaque, all others alpha; rest.png must be empty). boxes.json: every sidebar item (depth/active/kind), search trigger + kbd, breadcrumb, h1/description/actions, article blocks with per-line rects, footer, TOC items + geometry, colours, computed styles, activeRanges (scrollY range where each heading is >=90% visible = active).',
  };
  record('read', `docs.${theme}.${mode}`, entry);
  await page.context().close();
  return entry;
}

/** full-height article column as tiles (scroll + isolate #nd-page), alpha + opaque */
export async function readTall(browser, { theme = 'orange', mode = 'light', dpr = 2 } = {}) {
  const page = await newPage(browser, { ...READ_VP, dpr, mode });
  const url = `/themes/${theme}/${HERO}`;
  await load(page, url);
  const dir = `read/${theme}-${mode}/tall${dpr === 2 ? '' : `@${dpr}x`}`;
  const info = await page.evaluate(() => {
    const r = document.querySelector('#nd-page').getBoundingClientRect();
    return { x: r.x, w: r.width, docH: document.documentElement.scrollHeight, articleH: r.height };
  });
  const H = READ_VP.height;
  const maxScroll = info.docH - H;
  const tiles = [];
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__plates_tall';
    st.textContent = '*, *::before, *::after { transition: none !important; visibility: hidden !important; } #nd-page, #nd-page *, #nd-page *::before, #nd-page *::after { visibility: visible !important; }';
    document.head.append(st);
  });
  for (let k = 0; k * H < info.docH; k++) {
    const top = k * H;
    const scroll = Math.min(top, maxScroll);
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
    await settle(page);
    const clip = { x: info.x, y: top - scroll, width: info.w, height: Math.min(H, info.docH - top) - (top - scroll) + (top - scroll) };
    clip.height = Math.min(H - clip.y, info.docH - top);
    const name = String(k).padStart(2, '0');
    // opaque: body background stays
    await page.evaluate(() => document.body.style.removeProperty('background'));
    const opaque = await shot(page, `${dir}/opaque-${name}.png`, { clip });
    await page.evaluate(() => document.body.style.setProperty('background', 'transparent', 'important'));
    await page.evaluate(() => document.documentElement.style.setProperty('background', 'transparent', 'important'));
    const alpha = await shot(page, `${dir}/alpha-${name}.png`, { clip, omitBackground: true });
    await page.evaluate(() => {
      document.body.style.removeProperty('background');
      document.documentElement.style.removeProperty('background');
    });
    tiles.push({ index: k, docY: top, cssHeight: clip.height, pxHeight: Math.round(clip.height * dpr), alpha, opaque });
  }
  await page.context().close();
  const entry = {
    kind: 'tall-tiles',
    layout: 'docs',
    theme,
    mode,
    url,
    dpr,
    css: [info.w, info.docH],
    size: [Math.round(info.w * dpr), Math.round(info.docH * dpr)],
    columnX: info.x,
    tileCssHeight: H,
    tiles,
    notes:
      'The whole article column (#nd-page: breadcrumb, header, prose, footer) from y=0 to the document end, cut into tiles of 810 CSS px. Stack tile k at docY. x = columnX in the 1440-wide frame. alpha-* is transparent, opaque-* has the page background. Heading doc positions: read/<variant>/boxes.json activeRanges[].top.',
  };
  record('read', `docs.${theme}.${mode}.tall${dpr === 2 ? '' : `@${dpr}x`}`, entry);
  return entry;
}

import { freezeTimeline, unfreezeTimeline, collectNewAnimations, seekAnimations, layer, finishAnimations } from '../lib.mjs';
import { docsBoxes as _docsBoxes } from './docs-common.mjs';

const SEARCH_LAYERS = {
  backdrop: { show: ['div.fixed.inset-0.z-50[data-open]'], keepChildren: false },
  dialog: { show: ['#fd-search-dialog-content', '[role=dialog]'] },
};

async function searchBoxes(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const { $, $$, box, text } = P;
    const dialog = $('[role=dialog]');
    const input = dialog ? $('input', dialog) : null;
    const overlay = $('div.fixed.inset-0.z-50[data-open]');
    let caret = null;
    if (input) {
      const cs = getComputedStyle(input);
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
      span.textContent = input.value;
      document.body.append(span);
      const w = span.getBoundingClientRect().width;
      span.remove();
      const r = input.getBoundingClientRect();
      const pl = parseFloat(cs.paddingLeft);
      caret = P.fromRect({ x: r.x + pl + w, y: r.y + (r.height - parseFloat(cs.fontSize) * 1.25) / 2, width: 1, height: parseFloat(cs.fontSize) * 1.25 }, {}).css;
    }
    const rows = dialog ? $$('[role=option]', dialog) : [];
    return {
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      overlay: overlay && box(overlay, { background: getComputedStyle(overlay).backgroundColor, backdropFilter: getComputedStyle(overlay).backdropFilter }),
      dialog: dialog && box(dialog, { shadow: getComputedStyle(dialog).boxShadow }),
      header: dialog && box(dialog.firstElementChild),
      icon: dialog && box($('svg', dialog)),
      input: input && box(input, { value: input.value, placeholder: input.placeholder, font: getComputedStyle(input).font }),
      caret,
      close: dialog && box($('button', dialog), { text: text($('button', dialog)) }),
      list: dialog && box($('#fd-search-list', dialog)?.parentElement),
      rows: rows
        .filter((r) => r.getBoundingClientRect().height > 0)
        .map((r) => {
          const prose = $('.prose', r);
          const pc = prose?.className ?? '';
          const kind = /\bps-8\b/.test(pc) ? 'heading' : /\bps-4\b/.test(pc) ? 'text' : 'page';
          const crumbs = r.firstElementChild && !r.firstElementChild.classList.contains('prose') ? text(r.firstElementChild) : '';
          return box(r, { kind, text: text(prose), breadcrumbs: crumbs || undefined, active: r.getAttribute('aria-selected') === 'true', textBox: box(prose)?.css, lines: P.lines(prose) });
        }),
      footer: dialog && box(dialog.lastElementChild !== dialog.firstElementChild ? dialog.lastElementChild : null),
    };
  });
}

/** READ P1: ⌘K search on the hero page: open animation, every prefix state, ArrowDown, Enter */
export async function readSearch(browser, { theme = 'orange', mode = 'light', query = 'contents', downs = 1 } = {}) {
  const page = await newPage(browser, { ...READ_VP, mode });
  const url = `/themes/${theme}/${HERO}`;
  await load(page, url);
  const dir = `read/${theme}-${mode}/search-${query}`;
  const states = [];

  // opening animation (real time, 60 fps)
  await freezeTimeline(page);
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('[role=dialog]');
  await rafs(page, 4);
  const anims = await collectNewAnimations(page);
  const openMs = Math.max(...anims.filter((a) => Number.isFinite(a.endTime)).map((a) => a.endTime), 300);
  const openFrames = Math.round((openMs / 1000) * 60) + 1;
  for (let i = 0; i < openFrames; i++) {
    await seekAnimations(page, (i / (openFrames - 1)) * openMs);
    await shot(page, `${dir}/open/${String(i).padStart(4, '0')}.png`);
  }
  await unfreezeTimeline(page);
  await finishAnimations(page);
  log('search open', openFrames, 'frames', anims.map((a) => `${a.name}:${a.duration}`).join(' '));

  async function capture(name, label) {
    // wait for results (network + loading pulse gone) and settle
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('[role=dialog] svg.animate-pulse'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(250);
    await settle(page);
    const frame = await shot(page, `${dir}/${name}/frame.png`);
    const dialog = await layer(page, `${dir}/${name}/dialog.png`, SEARCH_LAYERS.dialog);
    await page.focus('[role=dialog] input');
    const boxes = await searchBoxes(page);
    const boxesFile = writeJSON(`${dir}/${name}/boxes.json`, boxes);
    states.push({ name, label, frame, dialog, boxes: boxesFile, value: boxes.input?.value, rows: boxes.rows.map((r) => ({ text: r.text, kind: r.kind, active: r.active, css: r.css })) });
  }

  await page.focus('[role=dialog] input');
  await rafs(page, 2);
  await capture('00-empty', 'open, empty');
  for (let i = 1; i <= query.length; i++) {
    await page.keyboard.type(query[i - 1]);
    await capture(`${String(i).padStart(2, '0')}-${query.slice(0, i)}`, `typed "${query.slice(0, i)}"`);
  }
  for (let d = 1; d <= downs; d++) {
    await page.keyboard.press('ArrowDown');
    await capture(`${String(query.length + d).padStart(2, '0')}-down${d}`, `ArrowDown x${d}`);
  }
  const backdrop = await layer(page, `${dir}/backdrop.png`, SEARCH_LAYERS.backdrop);
  // page behind (dialog + overlay hidden): the scene can blur it itself
  const behind = await layer(page, `${dir}/behind.png`, { show: null, hide: ['div.fixed.inset-0.z-50[data-open]', '[role=dialog]'], background: true });
  await page.focus('[role=dialog] input');
  await rafs(page, 2);
  // Enter: navigate to the selected result
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  await settle(page);
  const afterDir = `${dir}/after-enter`;
  const after = await shot(page, `${afterDir}/frame.png`);
  const afterToc = await layer(page, `${afterDir}/toc.png`, { show: ['#nd-toc'] });
  const afterBoxes = await _docsBoxes(page);
  afterBoxes.hash = await page.evaluate(() => location.hash);
  const afterBoxesFile = writeJSON(`${afterDir}/boxes.json`, afterBoxes);
  await page.context().close();

  // 60 fps typing timeline: one character per 0.1 s (6 frames), as in the film's 16ths
  const typing60 = [];
  states.forEach((st, i) => {
    for (let k = 0; k < 6; k++) typing60.push(st.frame);
  });
  const entry = {
    typing60: { fps: 60, framesPerState: 6, note: 'frame i = typing60.frames[i]; states in order: empty, each prefix, ArrowDown', frames: typing60 },
    kind: 'states+sequence',
    layout: 'docs',
    theme,
    mode,
    url,
    query,
    size: [READ_VP.width * 2, READ_VP.height * 2],
    css: [READ_VP.width, READ_VP.height],
    dpr: 2,
    open: { pattern: `${dir}/open/%04d.png`, count: openFrames, fps: 60, stretch: 1, durationMs: openMs, animations: anims },
    backdrop,
    behind,
    states,
    afterEnter: {
      frame: after,
      toc: afterToc,
      boxes: afterBoxesFile,
      scrollY: afterBoxes.scrollY,
      hash: afterBoxes.hash,
      activeToc: afterBoxes.toc?.items.filter((i) => i.active).map((i) => i.href),
    },
    notes:
      'Search dialog (⌘K) on the hero page. open/ = the real open animation at 60 fps (overlay fade-in + dialog-in, 300 ms). Each state = settled result list after typing one more character (hold each for a 16th = 6 frames). dialog.png = dialog only (alpha, incl. its shadow); backdrop.png = overlay colour only (the real overlay also has backdrop-filter, see boxes.overlay.backdropFilter; blur behind.png yourself); behind.png = the page under the dialog. Caret is hidden; boxes.caret gives where it would be. The first row is active by default; ArrowDown moves the highlight.',
  };
  record('read', `search.${query}.${theme}.${mode}`, entry);
  return entry;
}
