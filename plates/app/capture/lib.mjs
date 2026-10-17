// Node-side capture helpers (Playwright + CDP).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const OUT = path.resolve(ROOT, '..', 'out');
export const BASE = process.env.PLATES_URL ?? 'http://localhost:5310';
const INPAGE = path.join(import.meta.dirname, 'inpage.js');

export function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

export async function launch() {
  return chromium.launch({
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'],
  });
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{width:number,height:number,dpr?:number,mode?:'light'|'dark',mobile?:boolean}} o
 */
export async function newPage(browser, { width, height, dpr = 2, mode = 'light', mobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: mode,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript((m) => {
    try {
      localStorage.setItem('theme', m);
    } catch {}
  }, mode);
  // clipboard for copy buttons
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) console.error('[console]', m.text());
  });
  page.__opts = { width, height, dpr, mode, mobile };
  return page;
}

export async function rafs(page, n = 2) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r()));
  }, n);
}

/** wait for fonts + images, hide carets, finish running transitions */
export async function settle(page, { finish = true } = {}) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const img of document.images) img.loading = 'eager';
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });
  await page.evaluate(() => {
    if (document.getElementById('__plates_base')) return;
    const st = document.createElement('style');
    st.id = '__plates_base';
    st.textContent = '*, *::before, *::after { caret-color: transparent !important; }';
    document.head.append(st);
  });
  if (!(await page.evaluate(() => !!window.__plates))) await page.addScriptTag({ path: INPAGE });
  await rafs(page, 3);
  if (finish) await finishAnimations(page);
}

export async function finishAnimations(page) {
  for (let round = 0; round < 4; round++) {
    const n = await page.evaluate(() => {
      let n = 0;
      for (const a of document.getAnimations()) {
        const t = a.effect?.getComputedTiming();
        if (a.playState !== 'running' || !t) continue;
        if (t.endTime !== Infinity) {
          a.finish();
          n++;
        } else {
          // infinite (pulse, rainbow banner...): freeze at a fixed time for determinism
          a.pause();
          a.currentTime = 0;
        }
      }
      return n;
    });
    await rafs(page, 2);
    if (n === 0) break;
  }
}

export async function load(page, url, opts) {
  const res = await page.goto(BASE + url, { waitUntil: 'networkidle' });
  if (!res || res.status() >= 400) throw new Error(`${url} -> ${res?.status()}`);
  await settle(page, opts);
  await page.waitForTimeout(150);
  await settle(page, opts);
}

export function out(rel) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

export async function shot(page, rel, opts = {}) {
  const file = out(rel);
  await page.screenshot({ path: file, animations: 'allow', caret: 'hide', scale: 'device', ...opts });
  return rel;
}

/** screenshot with only `show` selectors visible (transparent background) */
export async function layer(page, rel, { show, hide = [], keepChildren = true, background = false, clip } = {}) {
  await page.evaluate(
    ({ show, hide, keepChildren, background }) => {
      const st = document.createElement('style');
      st.id = '__plates_layer';
      const sel = (s, suffix) => s.map((x) => x + suffix).join(', ');
      // transition: none, or visibility would transition (discretely, staying visible) instead of switching
      let css = '*, *::before, *::after { transition: none !important; }\n';
      if (!background) css += 'html, body { background: transparent !important; background-image: none !important; }\n';
      if (show) {
        css += '*, *::before, *::after { visibility: hidden !important; }\n';
        if (show.length) {
          css += `${sel(show, '')} { visibility: visible !important; }\n`;
          if (keepChildren) css += `${sel(show, ' *')}, ${sel(show, ' *::before')}, ${sel(show, ' *::after')}, ${sel(show, '::before')}, ${sel(show, '::after')} { visibility: visible !important; }\n`;
        }
      }
      if (hide.length) css += `${sel(hide, '')}, ${sel(hide, ' *')}, ${sel(hide, '::before')}, ${sel(hide, '::after')}, ${sel(hide, ' *::before')}, ${sel(hide, ' *::after')} { visibility: hidden !important; }\n`;
      st.textContent = css;
      document.head.append(st);
    },
    { show, hide, keepChildren, background },
  );
  await rafs(page, 2);
  const r = await shot(page, rel, { omitBackground: !background, clip });
  await page.evaluate(() => document.getElementById('__plates_layer')?.remove());
  await rafs(page, 1);
  await finishAnimations(page);
  return r;
}

/** CDP: freeze the document timeline (newly created animations stay at t=0) */
export async function cdp(page) {
  if (!page.__cdp) {
    page.__cdp = await page.context().newCDPSession(page);
    await page.__cdp.send('Animation.enable');
  }
  return page.__cdp;
}

export async function freezeTimeline(page) {
  const s = await cdp(page);
  await s.send('Animation.setPlaybackRate', { playbackRate: 0 });
  await page.evaluate(() => {
    window.__platesBefore = new Set(document.getAnimations());
  });
}

export async function unfreezeTimeline(page) {
  const s = await cdp(page);
  await s.send('Animation.setPlaybackRate', { playbackRate: 1 });
}

/** collect animations created since freezeTimeline; returns their timing */
export async function collectNewAnimations(page) {
  return page.evaluate(() => {
    const before = window.__platesBefore ?? new Set();
    const anims = document.getAnimations().filter((a) => !before.has(a));
    window.__platesAnims = anims;
    return anims.map((a) => {
      const t = a.effect.getComputedTiming();
      return {
        type: a.constructor.name,
        name: a.transitionProperty ?? a.animationName,
        target: a.effect.target?.tagName?.toLowerCase(),
        duration: t.duration,
        delay: t.delay,
        endTime: t.endTime,
        easing: t.easing,
        currentTime: a.currentTime,
      };
    });
  });
}

export async function seekAnimations(page, t) {
  await page.evaluate((t) => {
    for (const a of window.__platesAnims ?? []) {
      try {
        a.currentTime = t;
      } catch {}
    }
  }, t);
  await rafs(page, 1);
}

// ---------------------------------------------------------------- manifest

const FRAG = path.join(OUT, '_fragments');

/** write one manifest fragment (group/id) and rebuild manifest.json atomically */
export function record(group, id, entry) {
  fs.mkdirSync(FRAG, { recursive: true });
  const file = path.join(FRAG, `${group}__${id.replace(/[^\w.-]+/g, '_')}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ group, id, entry }, null, 1));
  fs.renameSync(tmp, file);
  buildManifest();
}

export function buildManifest() {
  const groups = {};
  if (fs.existsSync(FRAG)) {
    for (const f of fs.readdirSync(FRAG).sort()) {
      if (!f.endsWith('.json')) continue;
      try {
        const { group, id, entry } = JSON.parse(fs.readFileSync(path.join(FRAG, f), 'utf8'));
        (groups[group] ??= {})[id] = entry;
      } catch (e) {
        console.error('bad fragment', f, e.message);
      }
    }
  }
  const metaFile = path.join(import.meta.dirname, 'manifest-head.json');
  const head = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const manifest = { ...head, generated: new Date().toISOString(), ...groups };
  const target = path.join(OUT, 'manifest.json');
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 1));
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // validate
  fs.renameSync(tmp, target);
}

export function writeJSON(rel, data) {
  const file = out(rel);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
  return rel;
}
