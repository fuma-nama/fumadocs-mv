// INTEGRATIONS scene: OpenAPI (Scalar Galaxy, POST /planets), Story, Obsidian, Sanity-like blocks. Dark, neutral.
import { newPage, load, shot, record, writeJSON, log, rafs, settle, layer, finishAnimations } from '../lib.mjs';

export const INT_VP = { width: 1920, height: 1080, dpr: 2 };

function textBox(page, sel, text) {
  return page.evaluate(({ sel, text }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => window.__plates.text(e) === text && window.__plates.visible(e));
    return el ? window.__plates.box(el, { text }) : null;
  }, { sel, text });
}

async function opBoxes(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const { $, $$, box, text, visible } = P;
    const vis = (e) => e && visible(e);
    const h1 = $('#nd-page h1');
    const tryBtn = $$('button').find((b) => text(b) === 'Try in Playground');
    const bar = tryBtn?.parentElement;
    const method = bar ? $$('span', bar).find((s) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(text(s))) : null;
    const path = bar ? $$('span, code, p', bar).find((s) => text(s).startsWith('/') && !s.querySelector('span')) : null;
    const tabs = $$('button[role=tab], [role=tab]').filter(vis);
    const codeTabs = tabs.filter((t) => ['cURL', 'JavaScript', 'Go', 'Python', 'Java', 'C#', 'Rust'].includes(text(t)));
    // the card around a tab list = the closest ancestor that also contains the code (pre)
    const cardOf = (tab) => {
      // the first rounded, bordered ancestor of the tab list
      let el = tab?.closest('[role=tablist]') ?? tab;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.borderTopLeftRadius) >= 8 && parseFloat(cs.borderTopWidth) > 0) return el;
        el = el.parentElement;
      }
      return null;
    };
    const codePanel = cardOf(codeTabs[0]);
    const allStatus = tabs.filter((t) => /^\d{3}$/.test(text(t)) && !t.closest('[role=dialog]'));
    // the response example card (right column) vs the Response section tabs (main column)
    const statusTabs = allStatus.filter((t) => cardOf(t));
    const sectionTabs = allStatus.filter((t) => !cardOf(t));
    const respPanel = cardOf(statusTabs[0]);
    const reqBody = $$('h2, h3').find((h) => text(h) === 'Request Body');
    const auth = $$('h2, h3').find((h) => text(h) === 'Authorization');
    return {
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      scrollY,
      title: box(h1, { text: text(h1) }),
      breadcrumb: box($('#nd-page > :first-child'), { text: text($('#nd-page > :first-child')) }),
      endpointBar: box(bar),
      method: box(method, { text: text(method), color: method ? getComputedStyle(method).color : undefined }),
      path: box(path, { text: text(path) }),
      tryInPlayground: box(tryBtn, { text: 'Try in Playground' }),
      description: box(bar?.nextElementSibling, { text: text(bar?.nextElementSibling).slice(0, 140) }),
      authorization: box(auth, { text: 'Authorization' }),
      requestBody: box(reqBody, { text: 'Request Body' }),
      requestBodySection: box(reqBody?.nextElementSibling),
      codePanel: box(codePanel),
      codeTabs: codeTabs.map((t) => box(t, { text: text(t), selected: t.getAttribute('aria-selected') === 'true' })),
      responsePanel: box(respPanel),
      statusTabs: statusTabs.map((t) => box(t, { text: text(t), selected: t.getAttribute('aria-selected') === 'true' })),
      responseSectionTabs: sectionTabs.map((t) => box(t, { text: text(t), selected: t.getAttribute('aria-selected') === 'true' })),
      sidebarItems: P.sidebarItems(document.querySelector('#nd-sidebar [data-id^="base-ui"]')),
      sidebarBadges: $$('#nd-sidebar span.font-mono').filter(vis).map((s) => box(s, { text: text(s), color: getComputedStyle(s).color })),
    };
  });
}

export async function openapiOperation(browser) {
  const vp = INT_VP;
  const page = await newPage(browser, { ...vp, mode: 'dark' });
  const url = '/openapi/planets/createPlanet';
  await load(page, url);
  const dir = 'integrations/openapi';
  const frame = await shot(page, `${dir}/operation.png`);
  const boxes = await opBoxes(page);
  writeJSON(`${dir}/operation.boxes.json`, boxes);
  // code sample tabs: same crop for every tab (max height over all tabs)
  const names = boxes.codeTabs.map((t) => t.text);
  let maxH = 0;
  for (const n of names) {
    await page.getByRole('tab', { name: n, exact: true }).first().click();
    await rafs(page, 3);
    await settle(page);
    const b = await opBoxes(page);
    maxH = Math.max(maxH, b.codePanel.css[3]);
  }
  const [cx, cy, cw] = boxes.codePanel.css;
  const clip = { x: cx - 1, y: cy - 1, width: cw + 2, height: Math.min(maxH + 2, vp.height - cy) };
  const tabs = {};
  for (const n of names) {
    await page.getByRole('tab', { name: n, exact: true }).first().click();
    await page.mouse.move(vp.width - 5, vp.height - 5);
    await rafs(page, 3);
    await settle(page);
    const b = await opBoxes(page);
    const safe = n.replace('#', 'sharp').toLowerCase();
    tabs[n] = { still: await shot(page, `${dir}/code-${safe}.png`, { clip }), panel: b.codePanel, tabs: b.codeTabs };
  }
  await page.getByRole('tab', { name: 'cURL', exact: true }).first().click();
  await page.mouse.move(vp.width - 5, vp.height - 5);
  await settle(page);
  // tab dropdown/labels: isolated sidebar badges layer
  const badges = await layer(page, `${dir}/sidebar-badges.png`, { show: ['#nd-sidebar span.font-mono', '#nd-sidebar span.rounded-lg.font-mono'] });
  await page.context().close();
  record('integrations', 'openapi.operation', {
    kind: 'still+boxes+states',
    path: frame,
    size: [vp.width * 2, vp.height * 2],
    css: [vp.width, vp.height],
    dpr: 2,
    layout: 'docs',
    theme: 'neutral',
    mode: 'dark',
    url,
    spec: 'Scalar Galaxy (openapi/galaxy.yaml = fumadocs apps/docs/scalar.yaml), operation createPlanet = POST /planets',
    boxes: `${dir}/operation.boxes.json`,
    keyBoxes: boxes,
    codeSamples: { clip: [clip.x, clip.y, clip.width, clip.height], tabs },
    sidebarBadges: badges,
    notes: 'Operation page as rendered by fumadocs-openapi createOpenAPIPage(). codeSamples: one crop per language tab, identical clip. sidebar-badges.png: only the method badges of the sidebar (alpha).',
  });
  log('openapi operation');
}

export async function openapiPlayground(browser) {
  const vp = INT_VP;
  const page = await newPage(browser, { ...vp, mode: 'dark' });
  // mock the Galaxy API
  let release;
  const gate = new Promise((r) => (release = r));
  let hold = true;
  const body = {
    id: 42,
    name: 'Mars',
    description: 'The red planet',
    type: 'terrestrial',
    habitabilityIndex: 0.68,
    physicalProperties: { mass: 0.107, radius: 0.532, gravity: 0.378, temperature: { min: 130, max: 308, average: 210 } },
    atmosphere: [
      { compound: 'CO2', percentage: 95.3 },
      { compound: 'N2', percentage: 2.6 },
      { compound: 'Ar', percentage: 1.9 },
    ],
    discoveredAt: '1610-01-07T00:00:00Z',
    image: 'https://cdn.scalar.com/photos/mars.jpg',
    satellites: [
      { name: 'Phobos', diameter: 22.4 },
      { name: 'Deimos', diameter: 12.4 },
    ],
    creator: { id: 1, name: 'Marc', email: 'marc@scalar.com' },
    tags: ['solar-system', 'rocky', 'explored'],
    lastUpdated: '2026-10-11T09:41:00Z',
    successCallbackUrl: 'https://example.com/webhook',
    failureCallbackUrl: 'https://example.com/webhook',
  };
  await page.route('https://galaxy.scalar.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (hold) await gate;
    else await new Promise((r) => setTimeout(r, 118));
    await route.fulfill({
      status: 201,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'x-request-id': 'a8f3c2e1-5b7d-4e9a-8c6f-1d2e3f4a5b6c', location: '/planets/42' },
      body: JSON.stringify(body),
    });
  });
  const url = '/openapi/planets/createPlanet';
  await load(page, url);
  await page.getByText('Try in Playground').click();
  await page.waitForTimeout(700);
  await settle(page);
  const dir = 'integrations/openapi/playground';
  // fill: description + type
  const fill = async () => {
    const desc = page.locator('[role=dialog] input').nth(4);
    await desc.fill('The red planet');
    await page.getByRole('dialog').getByText('Unset', { exact: true }).click();
    await page.waitForTimeout(300);
    const opt = page.getByRole('option', { name: 'terrestrial' });
    if (await opt.count()) await opt.first().click();
    else await page.getByText('terrestrial', { exact: true }).last().click();
    await page.waitForTimeout(300);
  };
  await fill();
  await page.mouse.move(vp.width - 5, vp.height - 5);
  await settle(page);
  const dialogBox = await page.evaluate(() => window.__plates.box(document.querySelector('[role=dialog]')));
  const [dx, dy, dw, dh] = dialogBox.css;
  const clip = { x: dx - 24, y: dy - 24, width: dw + 48, height: Math.min(dh + 48, vp.height - dy + 24) };
  const pgBoxes = async () =>
    page.evaluate(() => {
      const P = window.__plates;
      const d = document.querySelector('[role=dialog]');
      const send = [...d.querySelectorAll('button')].find((b) => P.text(b).startsWith('Send'));
      const urlBar = send?.previousElementSibling ?? send?.parentElement?.firstElementChild;
      const method = [...d.querySelectorAll('span, p, div')].find((s) => P.text(s) === 'POST' && s.children.length === 0);
      const server = [...d.querySelectorAll('button')].find((b) => P.text(b).startsWith('https://'));
      const path = [...d.querySelectorAll('span, p, code')].find((s) => P.text(s) === '/planets' && s.children.length === 0);
      const s201 = [...d.querySelectorAll('span, p, div')].find((s) => P.text(s) === '201' && s.children.length === 0);
      let resp = s201;
      while (resp && resp !== d && !(/Headers/.test(P.text(resp)) && /ms/.test(P.text(resp)))) resp = resp.parentElement;
      if (resp === d) resp = null;
      const timing = resp ? [...resp.querySelectorAll('span, p, div')].find((s) => / ms/.test(P.text(s)) && s.children.length <= 1) : null;
      const respBody = resp ? resp.parentElement?.querySelector('pre') : null;
      const status = [...d.querySelectorAll('span, p, div')].filter((s) => /^(201|Created|201 Created)/.test(P.text(s)) && s.children.length === 0).map((s) => P.box(s, { text: P.text(s) }));
      const overlay = [...d.querySelectorAll('div')].find((e) => /Sending/i.test(P.text(e)) && e.children.length <= 3);
      const pres = [...d.querySelectorAll('pre, figure')].map((p) => P.box(p, { text: P.text(p).slice(0, 80) }));
      return {
        dialog: P.box(d),
        title: P.box(d.querySelector('h2, [id$=title]'), { text: P.text(d.querySelector('h2, [id$=title]')) }),
        urlBar: P.box(urlBar),
        method: P.box(method, { text: 'POST', color: method ? getComputedStyle(method).color : undefined, background: method ? getComputedStyle(method).backgroundColor : undefined }),
        server: P.box(server, { text: P.text(server) }),
        path: P.box(path, { text: '/planets' }),
        send: P.box(send, { text: P.text(send) }),
        responseHeader: P.box(resp, { text: P.text(resp).slice(0, 80) }),
        responseTiming: P.box(timing, { text: P.text(timing) }),
        responseBody: P.box(respBody?.closest('figure') ?? respBody, { text: P.text(respBody).slice(0, 80) }),
        status,
        sendingOverlay: P.box(overlay, { text: P.text(overlay).slice(0, 60) }),
        codeBlocks: pres,
        inputs: [...d.querySelectorAll('input')].filter((i) => i.getBoundingClientRect().width > 5).map((i) => P.box(i, { value: i.value, placeholder: i.placeholder })),
      };
    });
  const states = {};
  const capture = async (name, label) => {
    await rafs(page, 2);
    const b = await pgBoxes();
    states[name] = { label, still: await shot(page, `${dir}/${name}.png`, { clip }), frame: await shot(page, `${dir}/${name}-frame.png`), boxes: writeJSON(`${dir}/${name}.boxes.json`, b) };
    log('playground', name);
    return b;
  };
  const b0 = await capture('1-idle', 'idle, body filled (name Mars, description The red planet, type terrestrial)');
  const [sx, sy, sw, sh] = b0.send.css;
  await page.mouse.move(sx + sw / 2, sy + sh / 2);
  await page.waitForTimeout(250);
  await finishAnimations(page);
  await capture('2-send-hover', 'Send hovered');
  await page.mouse.down();
  await page.waitForTimeout(120);
  await capture('2b-send-pressed', 'Send pressed (mouse down)');
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.move(vp.width - 5, vp.height - 5);
  await page.waitForTimeout(200);
  await capture('3-sending', 'request in flight (response held)');
  hold = false;
  release();
  await page.waitForTimeout(800);
  // second request with a realistic latency (~120 ms) for the response state
  await page.locator('[role=dialog] button', { hasText: 'Send' }).first().click();
  await page.waitForTimeout(900);
  await page.mouse.move(vp.width - 5, vp.height - 5);
  await page.waitForTimeout(200);
  await settle(page);
  await capture('4-response', 'response 201 Created (mocked, ~120 ms latency)');
  await page.context().close();
  record('integrations', 'openapi.playground', {
    kind: 'states',
    css: [vp.width, vp.height],
    dpr: 2,
    theme: 'neutral',
    mode: 'dark',
    url,
    clip: [clip.x, clip.y, clip.width, clip.height],
    states,
    mockedResponse: { status: 201, body },
    notes: 'Playground dialog ("Try in Playground"), same clip for every state; -frame.png = full viewport. The Galaxy API is mocked with Playwright (201 + JSON); state 3 holds the response so the in-flight UI is visible. Timing/size shown by the UI are whatever the real component displays for the mocked response.',
  });
}

export async function openapiLabels(browser) {
  const page = await newPage(browser, { width: 800, height: 300, dpr: 4, mode: 'dark' });
  await load(page, '/labels');
  const dir = 'integrations/openapi/labels';
  const items = {};
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const b = await page.evaluate((m) => window.__plates.box(document.querySelector(`[data-method=${m}]`), { color: getComputedStyle(document.querySelector(`[data-method=${m}]`)).color }), m);
    const [x, y, w, h] = b.css;
    items[m] = { box: b, file: await layer(page, `${dir}/${m}.png`, { show: [`[data-method=${m}]`], clip: { x: x - 2, y: y - 2, width: w + 4, height: h + 4 } }) };
  }
  const wb = await page.evaluate(() => window.__plates.box(document.querySelector('[data-plate=webhook] span')));
  items.Webhook = { box: wb, file: await layer(page, `${dir}/Webhook.png`, { show: ['[data-plate=webhook] span'], clip: { x: wb.css[0] - 2, y: wb.css[1] - 2, width: wb.css[2] + 4, height: wb.css[3] + 4 } }) };
  await page.context().close();
  // light versions too
  const pl = await newPage(browser, { width: 800, height: 300, dpr: 4, mode: 'light' });
  await load(pl, '/labels');
  const light = {};
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const b = await pl.evaluate((m) => window.__plates.box(document.querySelector(`[data-method=${m}]`)), m);
    const [x, y, w, h] = b.css;
    light[m] = await layer(pl, `${dir}/${m}.light.png`, { show: [`[data-method=${m}]`], clip: { x: x - 2, y: y - 2, width: w + 4, height: h + 4 } });
  }
  await pl.context().close();
  record('integrations', 'openapi.labels', {
    kind: 'alpha crops',
    dpr: 4,
    items,
    light,
    notes: 'Method labels exactly as fumadocs-openapi renders them in the sidebar (MethodLabel/Badge: font-mono font-medium text-xs + method colour; dark: green/blue/yellow/orange/red-400), alpha, 4x, 2px margin. Playground URL-bar POST pill: see openapi.playground boxes (method).',
  });
  log('openapi labels');
}

// ---------------------------------------------------------------- Story

async function storyBoxes(page, index) {
  return page.evaluate((index) => {
    const P = window.__plates;
    const card = document.querySelectorAll('#nd-page .prose > div.not-prose')[index];
    if (!card) return null;
    const header = card.firstElementChild;
    const variant = header?.querySelector('[role=combobox]');
    const preview = card.children[1];
    const fields = [...card.querySelectorAll('fieldset fieldset')].map((f) => {
      const label = f.querySelector('label');
      const input = f.querySelector('input:not([aria-hidden=true]), [role=combobox], button[role=switch], button[role=checkbox]');
      return P.box(f, {
        name: P.text(label?.querySelector('span')),
        type: P.text(label?.querySelector('code')),
        label: P.box(label)?.css,
        control: P.box(input, { value: input?.value ?? P.text(input) })?.css,
        value: input?.value ?? P.text(input),
      });
    });
    return {
      card: P.box(card),
      header: P.box(header),
      displayName: P.box(header?.querySelector('p'), { text: P.text(header?.querySelector('p')) }),
      variantSelect: P.box(variant, { value: P.text(variant) }),
      preview: P.box(preview),
      component: P.box(preview?.firstElementChild, { text: P.text(preview).slice(0, 80) }),
      propsFieldset: P.box(card.querySelector(':scope > fieldset')),
      fields,
    };
  }, index);
}

async function pickOption(page, trigger, name) {
  await trigger.click();
  await page.waitForTimeout(300);
  // enum options are rendered as JSON literals ("info"), variant names as plain text
  let opt = page.getByRole('option', { name, exact: true });
  if ((await opt.count()) === 0) opt = page.getByRole('option', { name: JSON.stringify(name), exact: true });
  await opt.first().click();
  await page.waitForTimeout(300);
}

export async function storyCards(browser) {
  const vp = INT_VP;
  const page = await newPage(browser, { ...vp, mode: 'dark' });
  const url = '/themes/neutral/integrations/story';
  await load(page, url);
  const dir = 'integrations/story';
  const results = {};
  for (const [index, name] of [[0, 'callout'], [1, 'button']]) {
    const card = page.locator('#nd-page .prose > div.not-prose').nth(index);
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
    await rafs(page, 2);
    // expand Props
    await card.locator(':scope > fieldset button').first().click();
    await page.waitForTimeout(500);
    await page.mouse.move(vp.width - 5, vp.height - 5);
    await settle(page);
    const scrollY = await card.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY - 120));
    const restore = async () => {
      await page.keyboard.press('Escape').catch(() => {});
      await page.evaluate((y) => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, y);
      }, scrollY);
      await rafs(page, 2);
    };
    await restore();
    await settle(page);
    let b = await storyBoxes(page, index);
    const states = {};
    const clipFor = (bx) => ({ x: bx.card.css[0] - 12, y: bx.card.css[1] - 12, width: bx.card.css[2] + 24, height: bx.card.css[3] + 24 + 120 });
    const clip = clipFor(b);
    const capture = async (id, label) => {
      await restore();
      await page.mouse.move(vp.width - 5, vp.height - 5);
      await page.waitForTimeout(150);
      await settle(page);
      const bx = await storyBoxes(page, index);
      states[id] = { label, still: await shot(page, `${dir}/${name}/${id}.png`, { clip }), boxes: writeJSON(`${dir}/${name}/${id}.boxes.json`, bx), values: Object.fromEntries(bx.fields.map((f) => [f.name, f.value])), variant: bx.variantSelect?.value };
      log('story', name, id);
    };
    if (name === 'callout') {
      await capture('01-default', 'Default variant, title "This is a Callout", type unset (renders info)');
      const type = card.locator('[id=_type]');
      for (const t of ['info', 'warning', 'error', 'success']) {
        await pickOption(page, type, t);
        await capture(`02-type-${t}`, `type = ${t}`);
      }
      const title = card.locator('[id=_title]');
      await title.fill('Make it yours');
      await capture('03-title-make-it-yours', 'type = success, title "Make it yours"');
      await title.fill('This is a Callout');
      await pickOption(page, card.locator(':scope > div:first-child [role=combobox]'), 'Warning');
      await capture('04-variant-warning', 'variant select = Warning (type fixed to warning)');
      await pickOption(page, card.locator(':scope > div:first-child [role=combobox]'), 'Default');
      await capture('05-variant-default', 'variant select back to Default');
    } else {
      await capture('01-default', 'primary, md, enabled, "Get Started"');
      const variant = card.locator('[id=_variant]');
      for (const v of ['secondary', 'outline', 'primary']) {
        await pickOption(page, variant, v);
        await capture(`02-variant-${v}`, `variant = ${v}`);
      }
      await pickOption(page, card.locator('[id=_size]'), 'sm');
      await capture('03-size-sm', 'size = sm');
      await pickOption(page, card.locator('[id=_size]'), 'md');
      const disabled = card.locator('[id=_disabled]');
      if (await disabled.count()) {
        await pickOption(page, disabled.first(), 'true');
        await capture('04-disabled', 'disabled = true');
        await pickOption(page, disabled.first(), 'false');
      }
      await card.locator('[id=_children]').fill('Make it yours');
      await capture('05-children', 'children = "Make it yours"');
    }
    results[name] = { clip: [clip.x, clip.y, clip.width, clip.height], scrollY, states };
  }
  const frame = await shot(page, `${dir}/frame.png`);
  await page.context().close();
  record('integrations', 'story', {
    kind: 'states',
    css: [vp.width, vp.height],
    dpr: 2,
    theme: 'neutral',
    mode: 'dark',
    url,
    cards: results,
    frame,
    notes: '@fumadocs/story WithControl cards (the Callout story from fumadocs.dev + a Button story built on fumadocs-ui buttonVariants), Props fieldset expanded. Every state of one card uses the same clip (card + 12px margin, +120px below for taller states). boxes: card, header, variantSelect, preview, component, fields (name/type/label/control/value).',
  });
}

// ---------------------------------------------------------------- Obsidian + Sanity-like blocks

/** tag every direct child of the prose body so it can be isolated as a layer */
async function tagBlocks(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const prose = document.querySelector('#nd-page .prose');
    const blocks = P.articleBlocks(prose, { withLines: true });
    [...prose.children].forEach((el, i) => el.setAttribute('data-plate-block', String(i)));
    return [...prose.children].map((el, i) => ({ index: i, tag: el.tagName.toLowerCase(), ...P.box(el, { text: P.text(el).slice(0, 120) }) })).map((b, i) => ({ ...b, kind: blocks[i]?.kind }));
  });
}

export async function obsidianPages(browser) {
  const vp = INT_VP;
  const dir = 'integrations/obsidian';
  const out = {};
  for (const [slug, id] of [['Welcome', 'welcome'], ['Fumadocs%20Vault', 'fumadocs-vault']]) {
    const page = await newPage(browser, { ...vp, mode: 'dark' });
    const url = `/obsidian/${slug}`;
    await load(page, url);
    const frame = await shot(page, `${dir}/${id}.png`);
    const boxes = await page.evaluate(() => {
      const P = window.__plates;
      const prose = document.querySelector('#nd-page .prose');
      return {
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        title: P.box(document.querySelector('#nd-page h1'), { text: P.text(document.querySelector('#nd-page h1')) }),
        callouts: [...prose.querySelectorAll('div.rounded-xl.border.bg-fd-card')].map((c) => P.box(c, { text: P.text(c), color: getComputedStyle(c).getPropertyValue('--callout-color').trim() })),
        links: [...prose.querySelectorAll('a')].filter((a) => P.visible(a)).map((a) => P.box(a, { text: P.text(a), href: a.getAttribute('href') })),
        headings: [...prose.querySelectorAll('h1,h2,h3,h4')].map((h) => P.box(h, { text: P.text(h), id: h.id })),
        images: [...prose.querySelectorAll('img')].map((i) => P.box(i, { alt: i.alt, src: i.currentSrc })),
        sidebarItems: P.sidebarItems(document.querySelector('#nd-sidebar [data-id^="base-ui"]')),
        toc: [...document.querySelectorAll('#nd-toc a[href^="#"]')].map((a) => P.box(a, { text: P.text(a), active: a.getAttribute('data-active') === 'true' })),
        documentHeight: document.documentElement.scrollHeight,
      };
    });
    writeJSON(`${dir}/${id}.boxes.json`, boxes);
    // isolated callouts (alpha), each as a full-frame layer + tight crop
    const callouts = [];
    for (let i = 0; i < boxes.callouts.length; i++) {
      await page.evaluate((i) => document.querySelectorAll('#nd-page .prose div.rounded-xl.border.bg-fd-card')[i].setAttribute('data-plate-callout', String(i)), i);
      const [x, y, w, h] = boxes.callouts[i].css;
      if (y + h > vp.height) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, y - 200));
        await rafs(page, 2);
      }
      const r = await page.evaluate((i) => window.__plates.box(document.querySelector(`[data-plate-callout="${i}"]`)), i);
      callouts.push({
        ...boxes.callouts[i],
        crop: await layer(page, `${dir}/${id}-callout-${i}.png`, { show: [`[data-plate-callout="${i}"]`], clip: { x: r.css[0] - 2, y: r.css[1] - 2, width: r.css[2] + 4, height: r.css[3] + 4 } }),
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await rafs(page, 2);
    }
    // a frame scrolled so the last heading is in view
    const last = boxes.headings.at(-1);
    let scrolled;
    if (last && last.css[1] > vp.height - 100) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(last.css[1] - vp.height / 2));
      await rafs(page, 3);
      await settle(page);
      scrolled = { frame: await shot(page, `${dir}/${id}.scrolled.png`), scrollY: await page.evaluate(() => scrollY) };
    }
    await page.context().close();
    out[id] = { path: frame, url, boxes: `${dir}/${id}.boxes.json`, callouts, scrolled, keyBoxes: { title: boxes.title, callouts: boxes.callouts, links: boxes.links, headings: boxes.headings, images: boxes.images } };
    log('obsidian', id);
  }
  record('integrations', 'obsidian', {
    kind: 'stills+boxes+alpha callouts',
    css: [vp.width, vp.height],
    dpr: 2,
    theme: 'neutral',
    mode: 'dark',
    pages: out,
    notes: 'fumadocs-obsidian rendering the official example vault (examples/obsidian/public/vault: Welcome, hello world, create a link, Folder/Nested Page, Xmas.png) plus one extra note "Fumadocs Vault" with note/tip/warning/success callouts, wikilinks and an embed. Callout crops are alpha (2px margin). *.scrolled.png shows the last heading (e.g. "Introduction!!").',
  });
}

export async function sanityBlocks(browser) {
  const vp = INT_VP;
  const page = await newPage(browser, { ...vp, mode: 'dark' });
  const url = '/themes/neutral/integrations/sanity';
  await load(page, url);
  const dir = 'integrations/sanity';
  const blocks = await tagBlocks(page);
  const frame = await shot(page, `${dir}/page.png`);
  const toc = await layer(page, `${dir}/layers/toc.png`, { show: ['#nd-toc'] });
  const files = [];
  for (const b of blocks) {
    const file = await layer(page, `${dir}/blocks/${String(b.index).padStart(2, '0')}-${b.kind ?? b.tag}.png`, { show: [`[data-plate-block="${b.index}"]`] });
    files.push({ ...b, layer: file });
  }
  const header = await layer(page, `${dir}/layers/page-header.png`, { show: ['#nd-page > h1', '#nd-page > h1 + p', '[data-plate=page-actions]', '#nd-page > :first-child'] });
  const chrome = await layer(page, `${dir}/layers/chrome.png`, { show: null, hide: ['#nd-page .prose', '#nd-page > h1', '#nd-page > h1 + p', '[data-plate=page-actions]', '#nd-page > :first-child', '#nd-toc'], background: true });
  const boxes = await page.evaluate(() => ({ toc: [...document.querySelectorAll('#nd-toc a[href^="#"]')].map((a) => window.__plates.box(a, { text: window.__plates.text(a), active: a.getAttribute('data-active') === 'true' })) }));
  await page.context().close();
  record('integrations', 'sanity', {
    kind: 'still+block layers',
    path: frame,
    css: [vp.width, vp.height],
    dpr: 2,
    theme: 'neutral',
    mode: 'dark',
    url,
    blocks: files,
    layers: { toc, pageHeader: header, chrome },
    toc: boxes.toc,
    notes: 'Sanity is not wired to a hosted project (needs one); this is the docs page with the block types @fumadocs/sanity pages render through Fumadocs components (paragraph, h2, code block, Callout, Cards). Each block is a full-frame alpha layer (blocks/NN-kind.png) at its real position; chrome.png = everything except the article content and TOC (opaque); stack chrome + page-header + blocks + toc to rebuild page.png.',
  });
  log('sanity blocks', blocks.length);
}
