// TOC scene: geometry JSON + validation stills for every TOC variant.
import { newPage, load, shot, record, writeJSON, log, rafs, settle, finishAnimations } from '../lib.mjs';
import { READ_VP, HERO } from './read.mjs';
import { docsBoxes, activeRanges } from './docs-common.mjs';

const W = READ_VP.width;

async function tocInfo(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const toc = document.querySelector('#nd-toc');
    const g = P.tocGeometry(toc);
    return {
      toc: P.box(toc),
      geometry: g,
      styles: {
        item: P.styleOf(toc?.querySelector('a[href^="#"]')),
        activeItem: P.styleOf(toc?.querySelector('a[data-active=true]')),
        title: P.styleOf(toc?.querySelector('h3')),
      },
      colors: P.colors(),
      active: [...(toc?.querySelectorAll('a[data-active=true]') ?? [])].map((a) => a.getAttribute('href')),
      scrollY,
    };
  });
}

async function scrollTo(page, y) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await rafs(page, 3);
  await page.waitForTimeout(120);
  await finishAnimations(page);
  await settle(page);
}

/** geometry + stills for normal / clerk / block on the hero page */
export async function tocVariants(browser, { theme = 'orange', mode = 'light' } = {}) {
  const out = {};
  for (const style of ['normal', 'clerk', 'block']) {
    const page = await newPage(browser, { ...READ_VP, mode });
    const url = `/themes/${theme}/${HERO}?toc=${style}`;
    await load(page, url);
    const dir = `toc/${style}-${theme}-${mode}`;
    const boxes = await docsBoxes(page);
    const ranges = activeRanges(boxes, READ_VP.height);
    const byId = Object.fromEntries(ranges.map((r) => [r.id, r]));
    const states = {};
    const crop = async (name, label) => {
      const info = await tocInfo(page);
      const [x, y, w, h] = info.toc.css;
      const file = await shot(page, `${dir}/${name}.png`, { clip: { x, y, width: w, height: h } });
      const geo = writeJSON(`${dir}/${name}.json`, info);
      states[name] = { label, still: file, geometry: geo, scrollY: info.scrollY, active: info.active, clip: info.toc.css };
      return info;
    };
    // state 1: page top (Reading active)
    await crop('top', 'scroll 0');
    // state 2: only "Table of Contents" (as after the search jump)
    await scrollTo(page, byId['table-of-contents'].top - 112);
    await crop('table-of-contents', 'only Table of Contents active (scrollY = heading - 112, like the ⌘K jump)');
    // state 3: Layouts..Flux range needs a taller viewport
    const L = byId.layouts, F = byId.flux, G = byId.glass;
    const scroll = Math.floor(L.top - 4);
    const need = Math.ceil(F.top + F.height - scroll + 4);
    const maxH = Math.floor(G.top + 0.9 * G.height - scroll - 1);
    if (need <= maxH) {
      const H = Math.min(maxH, need + 40);
      await page.setViewportSize({ width: W, height: H });
      await scrollTo(page, scroll);
      await crop('layouts-flux', `Layouts…Flux range active (viewport ${W}x${H} so that exactly these four headings are visible)`);
      states['layouts-flux'].viewport = [W, H];
      await page.setViewportSize({ width: W, height: READ_VP.height });
    } else log('cannot isolate Layouts..Flux', need, maxH);
    // every heading alone (single heading at the top of the viewport), for pixel validation
    await page.setViewportSize({ width: W, height: READ_VP.height });
    await page.close();
    out[style] = { url, states };
    record('toc', `${style}.${theme}.${mode}`, {
      kind: 'geometry+stills',
      layout: 'docs',
      tocStyle: style,
      theme: theme === 'orange' ? 'neutral (+ primary #FA8023)' : theme,
      mode,
      url,
      dpr: 2,
      viewport: [W, READ_VP.height],
      states,
      activeRanges: ranges,
      notes:
        'Each state: <name>.png = opaque crop of #nd-toc (clip = css rect in the viewport), <name>.json = geometry in coordinates of the TOCItems container (geometry.container is its viewport rect): items (rect, offset, padding, textBox, textTop/textBottom, baseline, depth, rail svg paths), thumb (d, clip, --track-top/bottom, offset-distance, itemLineLengths, dot), block clip-path, title + icon, computed styles and colours.',
    });
    log('toc', style, theme, mode);
  }
  return out;
}

import { freezeTimeline, unfreezeTimeline, collectNewAnimations, seekAnimations, layer } from '../lib.mjs';

/** run `trigger` with a frozen timeline and capture `count` frames over `ms` (stretched) */
export async function seekSequence(page, { trigger, count, ms, pattern, clip, waitMs = 0 }) {
  await freezeTimeline(page);
  await trigger();
  await rafs(page, 4);
  if (waitMs) await page.waitForTimeout(waitMs);
  await rafs(page, 2);
  const anims = await collectNewAnimations(page);
  const end = ms ?? Math.max(0, ...anims.map((a) => (Number.isFinite(a.endTime) ? a.endTime : 0)));
  const files = [];
  for (let i = 0; i < count; i++) {
    await seekAnimations(page, count === 1 ? end : (i / (count - 1)) * end);
    files.push(await shot(page, pattern.replace('%04d', String(i).padStart(4, '0')), clip ? { clip } : {}));
  }
  await unfreezeTimeline(page);
  await finishAnimations(page);
  return { files, durationMs: end, animations: anims };
}

async function glassInfo(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const toc = document.querySelector('#nd-toc');
    const panel = toc?.querySelector('.grid.grid-cols-1');
    const rows = [...(panel?.querySelectorAll('a[href^="#"]') ?? [])];
    return {
      toc: P.box(toc),
      column: P.box(toc?.firstElementChild),
      title: P.box(toc?.querySelector('h3'), { text: P.text(toc?.querySelector('h3')), opacity: toc?.querySelector('h3') ? getComputedStyle(toc.querySelector('h3')).opacity : undefined }),
      panel: P.box(panel, { gridTemplateRows: panel ? getComputedStyle(panel).gridTemplateRows : undefined }),
      rows: rows.map((a) => {
        const tick = a.querySelector('div');
        const label = a.querySelector('span');
        return P.box(a, {
          text: P.text(a),
          href: a.getAttribute('href'),
          active: a.getAttribute('data-active') === 'true',
          tick: P.box(tick, { color: tick ? getComputedStyle(tick).backgroundColor : undefined })?.css,
          label: P.box(label, { opacity: label ? getComputedStyle(label).opacity : undefined }),
        });
      }),
      colors: P.colors(),
    };
  });
}

/** Glass minimap TOC: collapsed + expanded geometry/stills + the expand sequence */
export async function tocGlass(browser, { theme = 'orange', mode = 'dark', vp = READ_VP } = {}) {
  const page = await newPage(browser, { ...vp, mode });
  const url = `/themes/${theme}/x/glass/${HERO}`;
  await load(page, url);
  const dir = `toc/glass-${theme}-${mode}`;
  // scroll so a middle heading is active
  const y = await page.evaluate(() => document.getElementById('layouts').getBoundingClientRect().top + scrollY - 112);
  await page.evaluate((y) => scrollTo(0, y), y);
  await rafs(page, 3);
  await page.waitForTimeout(150);
  await settle(page);
  const collapsed = await glassInfo(page);
  // region covering both states: right column of the viewport
  const clip = { x: vp.width - 300, y: 0, width: 300, height: vp.height };
  const collapsedStill = await shot(page, `${dir}/collapsed.png`, { clip });
  const collapsedFrame = await shot(page, `${dir}/collapsed-frame.png`);
  writeJSON(`${dir}/collapsed.json`, collapsed);
  const [tx, ty, tw, th] = collapsed.panel.css;
  const seq = await seekSequence(page, {
    trigger: () => page.mouse.move(tx + tw - 4, ty + th / 2),
    count: 72,
    pattern: `${dir}/expand/%04d.png`,
    clip,
    waitMs: 50,
  });
  await page.waitForTimeout(400);
  // park the pointer on the active row (hovering the active item changes nothing)
  const act = await page.evaluate(() => {
    const a = document.querySelector('#nd-toc a[data-active=true]');
    const r = a.getBoundingClientRect();
    return [r.x + r.width - 2, r.y + r.height / 2];
  });
  await page.mouse.move(act[0], act[1]);
  await page.waitForTimeout(300);
  await settle(page);
  const expanded = await glassInfo(page);
  const expandedStill = await shot(page, `${dir}/expanded.png`, { clip });
  const expandedFrame = await shot(page, `${dir}/expanded-frame.png`);
  writeJSON(`${dir}/expanded.json`, expanded);
  await page.context().close();
  record('toc', `glass.${theme}.${mode}`, {
    kind: 'geometry+stills+sequence',
    layout: 'glass',
    theme: theme === 'orange' ? 'neutral (+ primary #FA8023)' : theme,
    mode,
    url,
    dpr: 2,
    viewport: [vp.width, vp.height],
    scrollY: y,
    clip: [clip.x, clip.y, clip.width, clip.height],
    collapsed: { still: collapsedStill, frame: collapsedFrame, geometry: `${dir}/collapsed.json`, rowPitch: collapsed.rows[1]?.css[1] - collapsed.rows[0]?.css[1] },
    expanded: { still: expandedStill, frame: expandedFrame, geometry: `${dir}/expanded.json`, rowPitch: expanded.rows[1]?.css[1] - expanded.rows[0]?.css[1] },
    sequence: { pattern: `${dir}/expand/%04d.png`, count: 72, fps: 60, durationMs: seq.durationMs, stretch: +(1200 / Math.max(1, seq.durationMs)).toFixed(3), animations: seq.animations },
    notes:
      'Glass minimap: collapsed ticks (4px dots, 12px pitch) expand on hover into lines (w = depth^1.5 * 4px, 1px) + labels (24px pitch). Stills/sequence are crops of the right 300 CSS px of the viewport (clip); *-frame.png are full frames. Active heading: Layouts. The real expand takes durationMs; the 72 frames sample it uniformly (stretch x).',
  });
  log('toc glass', mode);
}

/** mobile TOC popover bar (Docs layout, phone viewport) + transitions + tall page */
export async function tocMobile(browser, { theme = 'orange', mode = 'dark' } = {}) {
  const vp = { width: 390, height: 844, dpr: 2 };
  const page = await newPage(browser, { ...vp, mode, mobile: true });
  const url = `/themes/${theme}/${HERO}`;
  await load(page, url);
  const dir = `toc/mobile-${theme}-${mode}`;
  const info = async () =>
    page.evaluate(() => {
      const P = window.__plates;
      const bar = document.querySelector('[data-toc-popover]');
      const header = bar?.querySelector('header');
      const trigger = bar?.querySelector('[data-toc-popover-trigger]');
      const svgs = trigger ? [...trigger.querySelectorAll(':scope > svg')] : [];
      const circle = svgs[0];
      const prog = circle?.querySelectorAll('circle')[1];
      const spans = trigger ? [...trigger.querySelectorAll(':scope > span > span')] : [];
      const nav = document.querySelector('#nd-subnav');
      return {
        viewport: [innerWidth, innerHeight],
        scrollY,
        navbar: P.box(nav),
        navTitle: P.box(nav?.querySelector('a'), { text: P.text(nav?.querySelector('a')) }),
        navButtons: [...(nav?.querySelectorAll('button') ?? [])].map((b) => P.box(b)),
        bar: P.box(bar),
        header: P.box(header, { background: header ? getComputedStyle(header).backgroundColor : undefined, backdropFilter: header ? getComputedStyle(header).backdropFilter : undefined }),
        trigger: P.box(trigger, { padding: trigger ? getComputedStyle(trigger).padding : undefined }),
        progressCircle: P.box(circle, {
          value: circle?.getAttribute('aria-valuenow'),
          dasharray: prog?.getAttribute('stroke-dasharray'),
          dashoffset: prog?.getAttribute('stroke-dashoffset'),
          strokeWidth: 1.5,
          r: prog?.getAttribute('r'),
          color: circle ? getComputedStyle(circle).color : undefined,
        }),
        titles: spans.map((s) => P.box(s, { text: P.text(s), opacity: getComputedStyle(s).opacity, transform: getComputedStyle(s).transform })),
        chevron: P.box(svgs[1]),
        styles: { title: P.styleOf(spans[1] ?? spans[0]) },
        active: [...document.querySelectorAll('[data-toc-popover] a[data-active=true]')].map((a) => a.getAttribute('href')),
        headings: [...document.querySelectorAll('#nd-page :is(h2,h3,h4)[id]')].map((h) => ({ id: h.id, depth: +h.tagName[1], text: P.text(h), docY: Math.round((h.getBoundingClientRect().top + scrollY) * 100) / 100 })),
        documentHeight: document.documentElement.scrollHeight,
      };
    });
  const states = {};
  const capture = async (name, label) => {
    await settle(page);
    const i = await info();
    const barClip = { x: 0, y: i.bar.css[1], width: vp.width, height: Math.max(40, i.bar.css[3]) };
    states[name] = {
      label,
      frame: await shot(page, `${dir}/${name}-frame.png`),
      bar: await shot(page, `${dir}/${name}-bar.png`, { clip: barClip }),
      geometry: writeJSON(`${dir}/${name}.json`, i),
      scrollY: i.scrollY,
      progress: i.progressCircle?.value,
    };
    return i;
  };
  const first = await capture('top', 'scroll 0');
  const heads = Object.fromEntries(first.headings.map((h) => [h.id, h]));
  const navH = first.navbar?.css[3] ?? 56;
  const barH = 40;
  const go = async (id) => {
    await page.evaluate((y) => scrollTo(0, y), heads[id].docY - navH - barH - 16);
    await rafs(page, 3);
    await page.waitForTimeout(150);
  };
  await go('layouts');
  await settle(page);
  await capture('layouts', 'Layouts active');
  // transitions between headings (progress circle + title swap), 48 frames each
  const seqs = [];
  for (const [from, to] of [['table-of-contents', 'layouts'], ['layouts', 'docs'], ['integrations', 'showcase']]) {
    await go(from);
    await settle(page);
    const s = await seekSequence(page, {
      trigger: () => go(to),
      count: 48,
      pattern: `${dir}/seq-${from}__${to}/%04d.png`,
      clip: { x: 0, y: navH, width: vp.width, height: barH },
    });
    seqs.push({ from, to, pattern: `${dir}/seq-${from}__${to}/%04d.png`, count: 48, fps: 60, durationMs: s.durationMs, stretch: +(800 / Math.max(1, s.durationMs)).toFixed(3), animations: s.animations });
  }
  // open popover
  await go('layouts');
  await settle(page);
  await page.click('[data-toc-popover-trigger]');
  await page.waitForTimeout(400);
  await capture('layouts-open', 'popover open, Layouts active');
  await page.click('[data-toc-popover-trigger]');
  await page.waitForTimeout(400);
  await settle(page);
  // tall page without the sticky bar (tiles of 844 css px), plus the bar separately (above)
  await page.evaluate(() => scrollTo(0, 0));
  await settle(page);
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__plates_nobar';
    st.textContent = '[data-toc-popover] { visibility: hidden !important; } #nd-subnav { position: relative !important; }';
    document.head.append(st);
  });
  const tiles = [];
  const H = vp.height;
  for (let k = 0; k * H < docH; k++) {
    const top = k * H;
    const scroll = Math.min(top, docH - H);
    await page.evaluate((y) => scrollTo(0, y), scroll);
    await rafs(page, 2);
    await settle(page);
    const clip = { x: 0, y: top - scroll, width: vp.width, height: Math.min(H - (top - scroll), docH - top) };
    tiles.push({ index: k, docY: top, cssHeight: clip.height, file: await shot(page, `${dir}/tall/${String(k).padStart(2, '0')}.png`, { clip }) });
  }
  await page.context().close();
  record('toc', `mobile.${theme}.${mode}`, {
    kind: 'geometry+stills+sequences+tall',
    layout: 'docs (mobile)',
    theme: theme === 'orange' ? 'neutral (+ primary #FA8023)' : theme,
    mode,
    url,
    dpr: 2,
    viewport: [vp.width, vp.height],
    states,
    sequences: seqs,
    tall: { tiles, tileCssHeight: H, documentHeight: docH, headings: first.headings, note: 'Page with the TOC popover bar hidden and the navbar unstuck (it scrolls with the page); stack tile k at docY.' },
    notes:
      'Phone viewport 390x844 (isMobile). The popover bar sits under the navbar (#nd-subnav); progress = (last active index + 1) / items. *-bar.png crops the bar (clip in geometry.bar). Sequences crop the bar while scrolling heading to heading (progress circle transition-all 150ms + title roll), stretched to 48 frames.',
  });
  log('toc mobile', mode);
}

/** Spacious: TOC dropdown trigger with the rolling heading (page panel narrower than 1024px) */
export async function tocSpacious(browser, { theme = 'orange', mode = 'dark', vp = { width: 1280, height: 800, dpr: 2 } } = {}) {
  const page = await newPage(browser, { ...vp, mode });
  const url = `/themes/${theme}/x/spacious/${HERO}`;
  await load(page, url);
  const dir = `toc/spacious-${theme}-${mode}`;
  const info = async () =>
    page.evaluate(() => {
      const P = window.__plates;
      const panel = document.querySelector('#nd-page-panel');
      const header = panel?.querySelector(':scope > header');
      const trigger = header?.querySelector('button[aria-haspopup], button[data-popup-open], button');
      const btns = header ? [...header.querySelectorAll('button')] : [];
      const dd = btns.find((b) => b.querySelector('svg[role=progressbar]'));
      const scroller = panel?.querySelector(':scope > div');
      return {
        panel: P.box(panel),
        header: P.box(header),
        trigger: P.box(dd, { text: P.text(dd) }),
        progress: P.box(dd?.querySelector('svg[role=progressbar]'), { value: dd?.querySelector('svg[role=progressbar]')?.getAttribute('aria-valuenow') }),
        heading: P.box(dd?.querySelector('span > span'), { text: P.text(dd?.querySelector('span > span')) }),
        chevron: P.box(dd ? [...dd.querySelectorAll(':scope > svg')].at(-1) : null),
        scrollTop: scroller?.scrollTop,
        tocVisible: !!document.querySelector('#nd-toc') && getComputedStyle(document.querySelector('#nd-toc')).visibility !== 'hidden',
        headings: [...document.querySelectorAll('#nd-page :is(h2,h3,h4)[id]')].map((h) => ({ id: h.id, top: h.offsetTop })),
      };
    });
  const scrollPanel = async (id) => {
    await page.evaluate((id) => {
      const scroller = document.querySelector('#nd-page-panel > div');
      const h = document.getElementById(id);
      scroller.scrollTop += h.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 80;
    }, id);
    await rafs(page, 3);
    await page.waitForTimeout(150);
  };
  await scrollPanel('layouts');
  await settle(page);
  const i0 = await info();
  if (!i0.trigger) log('spacious: dropdown trigger not visible', JSON.stringify(i0).slice(0, 300));
  const clip = { x: i0.header.css[0], y: i0.header.css[1], width: i0.header.css[2], height: i0.header.css[3] };
  const still = await shot(page, `${dir}/trigger.png`, { clip });
  const frame = await shot(page, `${dir}/frame.png`);
  writeJSON(`${dir}/trigger.json`, i0);
  const seqs = [];
  for (const [from, to] of [['layouts', 'docs'], ['docs', 'notebook'], ['notebook', 'layouts']]) {
    await scrollPanel(from);
    await settle(page);
    const s = await seekSequence(page, { trigger: () => scrollPanel(to), count: 48, pattern: `${dir}/roll-${from}__${to}/%04d.png`, clip });
    seqs.push({ from, to, pattern: `${dir}/roll-${from}__${to}/%04d.png`, count: 48, fps: 60, durationMs: s.durationMs, stretch: +(800 / Math.max(1, s.durationMs)).toFixed(3), animations: s.animations });
  }
  await page.context().close();
  record('toc', `spacious.${theme}.${mode}`, {
    kind: 'geometry+stills+sequences',
    layout: 'spacious',
    theme: theme === 'orange' ? 'neutral (+ primary #FA8023)' : theme,
    mode,
    url,
    dpr: 2,
    viewport: [vp.width, vp.height],
    trigger: { still, frame, geometry: `${dir}/trigger.json`, clip: [clip.x, clip.y, clip.width, clip.height] },
    sequences: seqs,
    notes:
      'Spacious page-panel header at 1280x800: the TOC column is hidden (panel < 1024px), so the header shows the TOC dropdown trigger (progress circle + active heading that rolls in from the scroll direction, fd-roll-in 320ms). Sequences: crop of the header while the active heading changes (downwards then upwards), stretched to 48 frames.',
  });
  log('toc spacious', mode);
}
