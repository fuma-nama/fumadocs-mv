// Docs layout: layer selectors + box extraction shared by READ / themes / CLI jobs.
import { layer, shot, rafs } from '../lib.mjs';

export const DOCS_LAYERS = {
  background: { show: [], background: true },
  sidebar: { show: ['#nd-sidebar'] },
  'sidebar.bg': { show: ['#nd-sidebar'], keepChildren: false },
  'sidebar.header': { show: ['#nd-sidebar > div:first-child > div:first-child'] },
  'sidebar.search': { show: ['#nd-sidebar button[data-search-full]'] },
  'sidebar.tree': { show: ['#nd-sidebar > div:nth-child(2)'] },
  'sidebar.footer': { show: ['#nd-sidebar > div:last-child'] },
  breadcrumb: { show: ['#nd-page > :first-child'] },
  'page.header': { show: ['#nd-page > h1', '#nd-page > h1 + p', '[data-plate=page-actions]'] },
  'article.body': { show: ['#nd-page > .prose'] },
  'page.footer': { show: ['#nd-page > .prose ~ *'] },
  toc: { show: ['#nd-toc'] },
};

/** everything not covered by the named layers (should be empty) */
export const DOCS_REST = {
  hide: ['#nd-sidebar', '#nd-page > *', '#nd-toc'],
};

export async function captureLayers(page, dir, layers = DOCS_LAYERS) {
  const files = {};
  for (const [name, spec] of Object.entries(layers)) {
    files[name] = await layer(page, `${dir}/layers/${name}.png`, spec);
  }
  files.rest = await layer(page, `${dir}/layers/rest.png`, { show: null, ...DOCS_REST });
  return files;
}

/** boxes for the Docs layout (and the docs-style page body) */
export async function docsBoxes(page) {
  return page.evaluate(() => {
    const P = window.__plates;
    const { $, $$, box, text } = P;
    const sb = $('#nd-sidebar');
    const page = $('#nd-page');
    const toc = $('#nd-toc');
    const prose = $('#nd-page > .prose');
    const header = sb ? $(':scope > div:first-child', sb) : null;
    const logoRow = header ? $(':scope > div:first-child', header) : null;
    const search = sb ? $('button[data-search-full]', sb) : null;
    const footer = sb ? $(':scope > div:last-child', sb) : null;
    const toggle = footer ? $('[data-theme-toggle]', footer) : null;
    const crumb = page ? $(':scope > :first-child', page) : null;
    const actions = $('[data-plate=page-actions]');
    const after = page ? $$(':scope > .prose ~ *', page) : [];
    const tocItems = toc ? $$('a[href^="#"]', toc) : [];
    return {
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      scrollY,
      preset: document.documentElement.dataset.preset,
      mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      sidebar: sb && {
        box: box(sb),
        header: box(header),
        logo: box(logoRow ? $('a', logoRow) : null, { text: text(logoRow ? $('a', logoRow) : null) }),
        logoMark: box($('[data-plate=logo-mark]', sb)),
        logoText: box($('[data-plate=logo-text]', sb), { text: 'Fumadocs' }),
        collapseButton: box(logoRow ? $('button', logoRow) : null),
        search: search && {
          box: box(search),
          icon: box($('svg', search)),
          label: box([...search.childNodes].find((n) => n.nodeType === 3)?.parentElement === search ? null : null),
          kbd: $$('kbd', search).map((k) => box(k, { text: text(k) })),
        },
        tree: box(sb.children[1]),
        items: P.sidebarItems(sb.children[1]),
        footer: footer && {
          box: box(footer),
          inner: box(footer.firstElementChild),
          github: box($('a', footer)),
          themeToggle: box(toggle, {
            options: toggle ? $$('svg', toggle).map((s) => box(s, { active: s.getAttribute('data-active') ?? s.classList.contains('bg-fd-accent') })) : [],
          }),
        },
      },
      breadcrumb: crumb && {
        box: box(crumb),
        items: [...crumb.children].map((c) => box(c, { kind: c.tagName.toLowerCase() === 'svg' ? 'separator' : 'item', text: text(c) || undefined })),
      },
      header: {
        h1: box($('#nd-page > h1'), { text: text($('#nd-page > h1')), lines: P.lines($('#nd-page > h1')) }),
        description: box($('#nd-page > h1 + p'), { text: text($('#nd-page > h1 + p')), lines: P.lines($('#nd-page > h1 + p')) }),
        actions: actions && {
          box: box(actions),
          buttons: $$('button, a', actions).map((b) => box(b, { text: text(b) })),
        },
      },
      article: {
        box: box(page),
        prose: box(prose),
        blocks: P.articleBlocks(prose),
      },
      footer: after.map((el) => box(el, { text: text(el).slice(0, 160), links: $$('a', el).map((a) => box(a, { text: text(a) })) })),
      toc: toc && {
        box: box(toc),
        title: box($('h3', toc), { text: text($('h3', toc)) }),
        titleIcon: box($('h3 svg', toc)),
        items: tocItems.map((a) => box(a, { text: text(a), href: a.getAttribute('href'), active: a.getAttribute('data-active') === 'true' })),
        geometry: P.tocGeometry(toc),
      },
      colors: P.colors(),
      styles: {
        body: P.styleOf(document.body),
        h1: P.styleOf($('#nd-page > h1')),
        p: P.styleOf($('#nd-page > .prose > p')),
        sidebarItem: P.styleOf(sb ? $('a[data-active]', sb) : null),
        sidebarActive: P.styleOf(sb ? $('a[data-active=true]', sb) : null, ['color', 'backgroundColor', 'fontWeight']),
        tocItem: P.styleOf(tocItems[0]),
        tocTitle: P.styleOf(toc ? $('h3', toc) : null),
        code: P.styleOf($('figure.shiki code')),
      },
    };
  });
}

/** heading positions (document coords) + IntersectionObserver(threshold .9) active ranges */
export function activeRanges(boxes, viewportH) {
  const heads = boxes.article.blocks.filter((b) => /^h[2-6]$/.test(b.kind) && b.id);
  return heads.map((h) => {
    const [, y, , hh] = h.doc ?? h.css;
    return {
      id: h.id,
      text: h.text,
      depth: Number(h.kind[1]),
      top: y,
      height: hh,
      visibleScrollRange: [Math.max(0, Math.round((y + 0.9 * hh - viewportH) * 100) / 100), Math.round((y + 0.1 * hh) * 100) / 100],
    };
  });
}

export async function moveMouseAway(page) {
  const { width, height } = page.__opts;
  await page.mouse.move(width - 2, height - 2);
  await rafs(page, 2);
}
