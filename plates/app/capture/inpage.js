// Browser-side helpers, injected with page.addScriptTag. Exposes window.__plates.
(() => {
  const dpr = window.devicePixelRatio;
  const R = (v) => Math.round(v * 100) / 100;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  /** visible text (skips .sr-only helpers such as "Copy Anchor Link") */
  const text = (el) => {
    if (!el) return '';
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest('.sr-only')) continue;
      parts.push(n.textContent);
    }
    return parts.join('').replace(/\s+/g, ' ').trim();
  };

  /** css px rect + device px rect (+ document y) of a DOMRect-like */
  function fromRect(r, extra) {
    const out = {
      css: [R(r.x), R(r.y), R(r.width), R(r.height)],
      px: [Math.round(r.x * dpr), Math.round(r.y * dpr), Math.round(r.width * dpr), Math.round(r.height * dpr)],
    };
    if (window.scrollY !== 0) out.doc = [R(r.x + window.scrollX), R(r.y + window.scrollY), R(r.width), R(r.height)];
    return Object.assign(out, extra);
  }

  function box(el, extra = {}) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const cs = getComputedStyle(el);
    const radius = parseFloat(cs.borderTopLeftRadius);
    const b = fromRect(r, {});
    if (radius) b.r = radius;
    return Object.assign(b, extra);
  }

  /** merged line boxes of an element's text (Range.getClientRects, grouped by line) */
  function lines(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    const out = [];
    for (const r of rects) {
      const mid = r.y + r.height / 2;
      const line = out.find((l) => mid > l.y && mid < l.y + l.h);
      if (line) {
        const x2 = Math.max(line.x + line.w, r.x + r.width);
        const y2 = Math.max(line.y + line.h, r.y + r.height);
        line.x = Math.min(line.x, r.x);
        line.y = Math.min(line.y, r.y);
        line.w = x2 - line.x;
        line.h = y2 - line.y;
      } else out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    }
    out.sort((a, b) => a.y - b.y);
    return out.map((l) => fromRect({ x: l.x, y: l.y, width: l.w, height: l.h }, {}).css);
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    // effective opacity (an ancestor with opacity 0 hides it too)
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (Number(getComputedStyle(p).opacity) === 0) return false;
    }
    return true;
  }

  /** sidebar page tree items, in order, with depth */
  function sidebarItems(root) {
    const items = [];
    const tree = root;
    if (!tree) return items;
    const candidates = $$('a, button, p', tree).filter((el) => visible(el) && !el.closest('[data-plate-ignore]'));
    const set = new Set(candidates);
    for (const el of candidates) {
      // skip rows nested in another row (e.g. a link inside a folder trigger)
      let nested = false;
      for (let p = el.parentElement; p && p !== tree; p = p.parentElement) if (set.has(p)) nested = true;
      if (nested) continue;
      if (el.matches('[data-search], [data-search-full], [data-theme-toggle]')) continue;
      let depth = 0;
      for (let p = el.parentElement; p && p !== tree; p = p.parentElement) {
        if (p.id && p.id.startsWith('base-ui-') && (p.hasAttribute('data-open') || p.hasAttribute('data-closed'))) depth++;
      }
      const kind = el.tagName === 'P' ? 'separator' : el.tagName === 'BUTTON' ? 'folder' : 'page';
      const tokens = new Set((typeof el.className === 'string' ? el.className : '').split(/\s+/));
      const icon = $('svg:not([data-icon]):not(.lucide-chevron-down):not(.lucide-chevron-right)', el);
      items.push(
        box(el, {
          kind,
          text: text(el),
          depth,
          active: el.getAttribute('data-active') === 'true' || el.getAttribute('aria-current') === 'page' || tokens.has('bg-fd-primary/10'),
          inPath: tokens.has('text-fd-primary') || undefined,
          open: kind === 'folder' ? el.hasAttribute('data-panel-open') || el.getAttribute('aria-expanded') === 'true' : undefined,
          icon: icon ? box(icon)?.css : undefined,
        }),
      );
    }
    return items.filter(Boolean);
  }

  /** article blocks: headings, paragraphs, code blocks, callouts, cards, tabs, steps, lists, images, tables */
  function articleBlocks(prose, { withLines = true } = {}) {
    const out = [];
    if (!prose) return out;
    const push = (el, kind, extra = {}) => {
      const b = box(el, { kind, ...extra });
      if (b) out.push(b);
      return b;
    };
    const walk = (parent) => {
      for (const el of parent.children) {
        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          push(el, tag, { id: el.id || undefined, text: text(el), lines: withLines ? lines(el) : undefined });
        } else if (tag === 'p' && $(':scope > img', el) && !text(el)) {
          push(el, 'image', { alt: $('img', el).alt, src: $('img', el).currentSrc });
        } else if (tag === 'p') {
          push(el, 'p', { text: text(el), lines: withLines ? lines(el) : undefined });
        } else if (tag === 'ul' || tag === 'ol') {
          push(el, 'list', { items: $$(':scope > li', el).map((li) => box(li, { text: text(li), lines: withLines ? lines(li) : undefined })) });
        } else if (tag === 'figure' && el.classList.contains('shiki')) {
          const title = $('figcaption', el);
          const copy = $('button', el);
          push(el, 'code', {
            title: title ? text(title) : undefined,
            titleBar: title ? box(title.parentElement)?.css : undefined,
            copyButton: copy ? box(copy)?.css : undefined,
            lines: $$('.line', el).map((l) => box(l)?.css),
            code: $$('.line', el).map((l) => l.textContent),
          });
        } else if (el.classList.contains('fd-steps')) {
          push(el, 'steps', { steps: $$(':scope > .fd-step', el).map((s) => box(s, { text: text($('h3', s) ?? s).slice(0, 80) })) });
          walk(el);
        } else if (el.classList.contains('fd-step')) {
          walk(el);
        } else if (el.getAttribute('role') === 'tablist' || $(':scope > [role=tablist]', el)) {
          const list = $('[role=tablist]', el);
          const tabs = $$('[role=tab]', el).map((t) => box(t, { text: text(t), selected: t.getAttribute('aria-selected') === 'true' }));
          const panel = $$('[role=tabpanel]', el).find((p) => visible(p));
          const isCode = !!$('figure.shiki, pre', el);
          push(el, isCode ? 'codetabs' : 'tabs', { list: box(list)?.css, tabs, panel: panel ? box(panel)?.css : undefined, text: panel ? text(panel).slice(0, 120) : undefined });
        } else if (el.matches('div.flex.gap-2.my-4.rounded-xl') || el.querySelector(':scope > .w-0\\.5')) {
          const title = $('p.font-medium', el);
          const color = getComputedStyle(el).getPropertyValue('--callout-color').trim();
          push(el, 'callout', { title: title ? text(title) : undefined, text: text(el).slice(0, 160), color });
        } else if (el.classList.contains('grid') && $('[data-card]', el)) {
          push(el, 'cards', { cards: $$('[data-card]', el).map((c) => box(c, { title: text($('h3', c) ?? c).slice(0, 60), text: text(c).slice(0, 140) })) });
        } else if (tag === 'img' || $(':scope > img', el)) {
          push(el, 'image', { alt: (tag === 'img' ? el : $('img', el)).alt });
        } else if (text(el).startsWith('PropType')) {
          push(el, 'typetable', {
            rows: $$(':scope > div > div, :scope [role=row]', el).filter((r) => r.children.length >= 2).map((r) => box(r, { text: text(r).slice(0, 100) })),
            text: text(el).slice(0, 160),
          });
        } else if ($('table', el) || tag === 'table') {
          push(el, $('.fd-type-table, [class*=type-table]', el) ? 'typetable' : 'table', { text: text(el).slice(0, 160) });
        } else if (el.matches('[data-accordion], .divide-y') || $('[data-orientation] [aria-expanded]', el)) {
          push(el, 'accordion', { text: text(el).slice(0, 160) });
        } else {
          push(el, tag === 'div' ? 'block' : tag, { text: text(el).slice(0, 160), cls: (el.className || '').toString().slice(0, 80) });
        }
      }
    };
    walk(prose);
    return out;
  }

  /** geometry of the TOC (normal/clerk variants) in coordinates of the TOCItems container */
  function tocGeometry(tocRoot) {
    if (!tocRoot) return null;
    const anchors = $$('a[href^="#"]', tocRoot).filter((a) => a.closest('[class*=flex-col]'));
    if (anchors.length === 0) return null;
    const container = anchors[0].parentElement; // TOCItems container (relative flex flex-col)
    const c = container.getBoundingClientRect();
    const rel = (r) => [R(r.x - c.x), R(r.y - c.y), R(r.width), R(r.height)];
    const items = anchors.map((a) => {
      const cs = getComputedStyle(a);
      const id = decodeURIComponent((a.getAttribute('href') ?? '').slice(1));
      const heading = document.getElementById(id);
      const depth = heading && /^H[1-6]$/.test(heading.tagName) ? Number(heading.tagName[1]) : undefined;
      // baseline: a zero-size inline-block aligned to the baseline, inserted before the title text
      const firstText = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      let baseline;
      if (firstText) {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
        a.insertBefore(probe, firstText);
        baseline = R(probe.getBoundingClientRect().y - c.y);
        probe.remove();
      }
      const range = document.createRange();
      // first text node = the title (skip the rail svg)
      const tn = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) ?? a;
      range.selectNodeContents(tn);
      const tr = range.getBoundingClientRect();
      const rail = $(':scope > svg', a);
      const railPaths = rail
        ? [...rail.querySelectorAll('path, line')].map((p) =>
            p.tagName === 'line'
              ? { line: [p.getAttribute('x1'), p.getAttribute('y1'), p.getAttribute('x2'), p.getAttribute('y2')] }
              : { d: p.getAttribute('d') },
          )
        : [];
      return {
        title: text(a),
        depth,
        baseline,
        url: a.getAttribute('href'),
        active: a.getAttribute('data-active') === 'true',
        rect: rel(a.getBoundingClientRect()),
        offset: [a.offsetLeft, a.offsetTop, a.offsetWidth, a.offsetHeight],
        padding: [parseFloat(cs.paddingTop), parseFloat(cs.paddingRight), parseFloat(cs.paddingBottom), parseFloat(cs.paddingLeft)],
        textBox: rel(tr),
        textTop: R(a.offsetTop + parseFloat(cs.paddingTop)),
        textBottom: R(a.offsetTop + a.clientHeight - parseFloat(cs.paddingBottom)),
        color: cs.color,
        rail: rail ? { rect: rel(rail.getBoundingClientRect()), paths: railPaths } : undefined,
      };
    });
    // thumb track (the active path)
    const track = $(':scope > div.absolute', container);
    let thumb = null;
    if (track) {
      const svg = $('svg', track);
      const path = svg ? $('path', svg) : null;
      const dot = $(':scope > div', track);
      const cs = getComputedStyle(track);
      thumb = {
        rect: rel(track.getBoundingClientRect()),
        d: path?.getAttribute('d'),
        svgClip: svg ? getComputedStyle(svg).clipPath : undefined,
        trackTop: cs.getPropertyValue('--track-top').trim(),
        trackBottom: cs.getPropertyValue('--track-bottom').trim(),
        offsetDistance: cs.getPropertyValue('--offset-distance').trim() || undefined,
        dot: dot ? { rect: rel(dot.getBoundingClientRect()), offsetPath: getComputedStyle(dot).offsetPath, opacity: getComputedStyle(dot).opacity } : undefined,
        stroke: path ? getComputedStyle(path).stroke : undefined,
      };
    }
    // the thumb's offset-distance per item, computed exactly like components/toc/default.tsx
    if (thumb?.d) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', thumb.d);
      const n = path.getTotalLength();
      const lengths = [];
      items.forEach((item, i) => {
        const top = item.textTop;
        const bottom = item.textBottom;
        let l = i > 0 ? lengths[i - 1][1] + (top - items[i - 1].textBottom) : top;
        while (l < n && path.getPointAtLength(l).y < top) l++;
        lengths.push([l, l + bottom - top]);
      });
      thumb.totalLength = R(n);
      thumb.itemLineLengths = lengths.map(([a, b]) => [R(a), R(b)]);
      thumb.dotSize = 4;
    }
    const title = tocRoot.querySelector('h3');
    // block variant highlight
    const block = $(':scope > div.absolute.inset-0', container);
    return {
      container: fromRect(c, {}).css,
      title: title ? { rect: rel(title.getBoundingClientRect()), text: text(title), icon: title.querySelector('svg') ? rel(title.querySelector('svg').getBoundingClientRect()) : undefined } : undefined,
      scroller: rel(container.parentElement.getBoundingClientRect()),
      items,
      thumb,
      block: block ? { clipPath: getComputedStyle(block).clipPath, background: getComputedStyle(block).backgroundImage } : undefined,
    };
  }

  function styleOf(el, props = ['fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'color']) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  }

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const names = ['background', 'foreground', 'muted', 'muted-foreground', 'popover', 'popover-foreground', 'card', 'card-foreground', 'border', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground', 'ring'];
    const probe = document.createElement('div');
    document.body.append(probe);
    const out = {};
    for (const n of names) {
      probe.style.color = `var(--color-fd-${n})`;
      out[n] = getComputedStyle(probe).color;
    }
    probe.remove();
    out.bodyBackground = getComputedStyle(document.body).backgroundColor;
    return out;
  }


  /** generic layout boxes for docs / notebook / flux / glass / spacious / home */
  function layoutBoxes({ blocks = 16 } = {}) {
    const root = document.querySelector('body > div[id^="nd-"], body > div[id^="fd-"]');
    const sb = $('#nd-sidebar');
    const article = $('#nd-page');
    const prose = article ? $(':scope > .prose', article) : null;
    const toc = $('#nd-toc');
    const header = $('#nd-subnav') ?? $('#nd-nav');
    const vis = (el) => el && visible(el);
    const pick = (el, extra) => (vis(el) ? box(el, extra) : null);
    const logo = $$('[data-plate=logo-mark]').map((m) => m.closest('a')).find((a) => vis(a));
    const searchFull = $$('[data-search-full]').find(vis);
    const searchIcons = $$('button[data-search]').filter(vis);
    const toggles = $$('[data-theme-toggle]').filter(vis);
    const github = $$('a[href*="github.com"]').filter(vis);
    const tabDropdown = $$('button')
      .filter(vis)
      .find((b) => /^(Framework|Core|MDX|CLI|Integrations)/.test(text(b)) && (b.hasAttribute('data-base-ui-click-trigger') || b.hasAttribute('aria-haspopup')) && !b.closest('[data-open], [data-closed]'));
    const tabsRow = $('[data-header-tabs]');
    const out = {
      viewport: [innerWidth, innerHeight],
      dpr,
      scrollY,
      root: root ? { id: root.id, ...box(root) } : null,
      background: getComputedStyle(document.body).backgroundColor,
      header: pick(header, { id: header?.id }),
      headerBody: pick(header?.querySelector('[data-header-body]')),
      tabs: vis(tabsRow) ? { box: box(tabsRow), items: $$('a', tabsRow).map((a) => box(a, { text: text(a), active: /border-fd-primary/.test(a.className) })) } : null,
      logo: pick(logo, { text: text(logo) }),
      logoMark: pick(logo?.querySelector('[data-plate=logo-mark]')),
      search: pick(searchFull, { kbd: searchFull ? $$('kbd', searchFull).map((k) => box(k, { text: text(k) })) : undefined }),
      searchIcons: searchIcons.map((b) => box(b)),
      themeToggles: toggles.map((t) => box(t)),
      github: github.map((g) => box(g)),
      tabDropdown: pick(tabDropdown, { text: text(tabDropdown) }),
      sidebar: vis(sb)
        ? {
            box: box(sb),
            background: getComputedStyle(sb).backgroundColor,
            items: sidebarItems(sb.querySelector('[data-id^="base-ui"]') ?? sb),
            footer: pick(toggles.find((t) => sb.contains(t))?.closest('div.flex')),
          }
        : null,
      main: pick($('main[data-layout-main]') ?? $('#nd-page-panel')),
      article: vis(article)
        ? {
            box: box(article),
            breadcrumb: pick(article.querySelector(':scope > div:first-child:not(.prose), :scope > nav')),
            h1: pick($('h1', article), { text: text($('h1', article)) }),
            description: pick($('h1 + p', article), { text: text($('h1 + p', article)) }),
            actions: pick($('[data-plate=page-actions]', article), { buttons: $$('[data-plate=page-actions] > *', article).map((b) => box(b, { text: text(b) })) }),
            blocks: articleBlocks(prose, { withLines: false }).slice(0, blocks),
          }
        : null,
      toc: vis(toc)
        ? {
            box: box(toc),
            title: pick($('h3', toc), { text: text($('h3', toc)) }),
            items: $$('a[href^="#"]', toc).map((a) => box(a, { text: text(a), active: a.getAttribute('data-active') === 'true', tick: a.querySelector(':scope > div.rounded-full') ? box(a.querySelector(':scope > div.rounded-full'))?.css : undefined })),
            geometry: tocGeometry(toc),
          }
        : null,
    };
    // flux floating panel + page tree overlay
    const fluxPanel = $$('div.fixed').find((d) => /left-1\/2/.test(d.className) && vis(d));
    if (fluxPanel) {
      out.flux = {
        panel: box(fluxPanel),
        rows: [...fluxPanel.children].map((r) => box(r)),
        tocPopover: pick(fluxPanel.querySelector('[data-toc-popover] header'), { text: text(fluxPanel.querySelector('[data-toc-popover-trigger]')) }),
        progress: pick(fluxPanel.querySelector('svg[role=progressbar]'), { value: fluxPanel.querySelector('svg[role=progressbar]')?.getAttribute('aria-valuenow') }),
        controls: $$('button, a', fluxPanel).filter(vis).map((b) => box(b, { label: b.getAttribute('aria-label') ?? text(b) })),
      };
      const overlay = $$('div.fixed.inset-0').find((d) => /backdrop-blur-md/.test(d.className));
      if (overlay) out.flux.overlay = box(overlay, { opacity: getComputedStyle(overlay).opacity, sidebar: sb ? box(sb)?.css : undefined });
    }
    // glass pill header
    if (root?.id === 'fd-glass-layout') {
      const pills = $$('div.sticky').find((d) => /justify-end/.test(d.className));
      out.glass = {
        sidebarCard: box(sb),
        pillRow: pick(pills),
        pills: pills ? [...pills.children].filter(vis).map((c) => box(c, { text: text(c) })) : [],
      };
    }
    if (root?.id === 'fd-spacious-layout') {
      const panel = $('#nd-page-panel');
      const ph = panel?.querySelector(':scope > header');
      out.spacious = {
        surface: box(root, { background: getComputedStyle(root).backgroundColor }),
        panel: box(panel, { background: panel ? getComputedStyle(panel).backgroundColor : undefined }),
        panelHeader: pick(ph),
        breadcrumb: pick(ph?.querySelector('nav'), { text: text(ph?.querySelector('nav')) }),
        actions: pick(ph?.querySelector(':scope > div:last-child'), { items: ph ? $$(':scope > div:last-child > *', ph).map((b) => box(b, { label: b.getAttribute('aria-label') ?? text(b) })) : [] }),
      };
    }
    const hero = $('[data-plate=hero]');
    if (hero) {
      out.home = {
        nav: box($('#nd-nav')),
        navLinks: $$('#nd-nav a').filter(vis).map((a) => box(a, { text: text(a) })),
        hero: box(hero),
        badge: box($('[data-plate=hero-badge]'), { text: text($('[data-plate=hero-badge]')) }),
        title: box($('[data-plate=hero-title]'), { text: text($('[data-plate=hero-title]')), lines: lines($('[data-plate=hero-title]')) }),
        description: box($('[data-plate=hero-description]'), { text: text($('[data-plate=hero-description]')) }),
        ctas: $$('[data-plate=hero-actions] a').map((a) => box(a, { text: text(a) })),
        image: box($('[data-plate=hero-image]')),
      };
    }
    return out;
  }

  window.__plates = { layoutBoxes, box, lines, text, $, $$, visible, sidebarItems, articleBlocks, tocGeometry, styleOf, colors, fromRect };
})();
