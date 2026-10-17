"""Build showcase scene assets: tile atlas, scroll strips, parade hero images, sites.gen.ts.

Run with any Python that has Pillow, from a checkout next to the fumadocs repo (or set FUMADOCS_DOCS
to its apps/docs):  python -I mv/src/scenes/showcase/tools/build_assets.py
Inputs (read-only): fumadocs repo showcase thumbnails + page.tsx, assets/showcase captures (only the
sites the film shows full-page are in this repo).
Outputs: assets/scenes/showcase/{atlas.jpg,strips.jpg,hero/*.jpg}, mv/src/scenes/showcase/sites.gen.ts
"""
import json
import os
import re
import colorsys
from PIL import Image, ImageStat

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
REPO = os.environ.get('FUMADOCS_DOCS', os.path.join(ROOT, '../fumadocs/apps/docs'))
THUMBS = REPO + '/public/showcases'
PAGE = REPO + '/app/(home)/showcase/page.tsx'
CAPS = os.path.join(ROOT, 'assets/showcase')
OUT = os.path.join(ROOT, 'assets/scenes/showcase')
GEN = os.path.join(ROOT, 'mv/src/scenes/showcase/sites.gen.ts')

INK = (10, 10, 11)

# atlas: 8 x 12 cells of 512x320 (16:10) with an INK bezel (mip bleed guard)
CW, CH, COLS, ROWS, BEZEL = 512, 320, 8, 12, 6
AW, AH = CW * COLS, 4096
# scroll strips: 8 columns of 512 x 2048
SW, SH, SCOLS = 512, 2048, 8

# Parade (front-centre landings) — slug: capture variant ('og' = repo thumbnail)
HERO = {
    'evilcharts': 'components-dark',
    'shadcn-ui': 'landing',
    'better-auth': 'landing-dark',
    'zod': 'docs',
    'prisma': 'docs-dark',
    'better-t-stack': 'landing-dark',
    'arktype': 'landing',
    'turborepo': 'landing',
    'zen-browser': 'og',
}
# full-page scroll strips (tall screens)
STRIPS = ['evilcharts', 'prisma', 'turborepo', 'better-t-stack', 'pothos', 'cua', 'menlo', 'opencoven']
# capture variant used for a site's tile when it has no repo thumbnail (else best-scoring landing)
TILE_PREF = {
    'evilcharts': 'components-dark',
    'better-t-stack': 'landing-dark',
    'prisma': 'docs-dark',
    'turbobulls': 'landing',
    'better-auth': 'landing-dark',
    'arktype': 'landing',
    'turborepo': 'landing-dark',
    'cua': 'landing',
    'opencoven': 'landing-dark',
    'pothos': 'landing',
    'reopt-handbook': 'landing-dark',
    'menlo': 'landing',
    'chainbound': 'landing-dark',
    'hexaa': 'og',
    'shadcn-ui': 'og',
    'zod': 'og',
    'zen-browser': 'og',
    'ultracite': 'og',
    'react-pdf': 'landing-dark',
    'bklit-ui': 'landing-dark',
    'fuma-tui': 'landing-dark',
}
# director: third-party IP — never used
EXCLUDE = {'warcraftcn', 'notion-ui'}
# extra captures (assets/showcase/extras/<slug>): name, url
EXTRAS = {
    'shadcn-ui': ('shadcn/ui', 'https://ui.shadcn.com'),
    'zod': ('Zod', 'https://zod.dev'),
    'zen-browser': ('Zen Browser', 'https://docs.zen-browser.app'),
    'ultracite': ('Ultracite', 'https://www.ultracite.ai'),
    'react-pdf': ('React-PDF', 'https://react-pdf.org'),
    'bklit-ui': ('Bklit UI', 'https://bklit.com'),
    'userinterface-wiki': ('userinterface.wiki', 'https://www.userinterface.wiki'),
    'xlog': ('xlog', 'https://www.xlog.systems'),
    'fuma-tui': ('Fuma TUI', 'https://fuma-tui.vercel.app'),
}


def host(url):
    h = re.sub(r'^https?://', '', url).rstrip('/')
    return re.sub(r'^www\.', '', h)


def parse_page():
    src = open(PAGE, encoding='utf8').read()
    imports = dict(re.findall(r"import (\w+) from '@/public/showcases/([^']+)'", src))
    body = src[src.index('const showcases'):src.index('const blogs')]
    blogs = src[src.index('const blogs'):src.index('const vercel')]
    out = []
    for chunk in (body, blogs):
        for m in re.finditer(r'\{([^{}]*?)\}', chunk, re.S):
            obj = m.group(1)
            name = re.search(r"name:\s*(['\"])(.*?)\1", obj)
            url = re.search(r"url:\s*'([^']+)'", obj)
            if not name or not url:
                continue
            img = re.search(r"image:\s*'/showcases/([^']+)'", obj)
            imgv = re.search(r"image:\s*(\w+)\s*,", obj)
            file = img.group(1) if img else (imports.get(imgv.group(1)) if imgv else None)
            out.append({'name': name.group(2), 'url': url.group(1), 'thumb': file})
    return out


def colourfulness(im):
    sm = im.convert('RGB').resize((64, 40))
    px = list(sm.get_flattened_data())
    rg = [abs(r - g) for r, g, b in px]
    yb = [abs((r + g) / 2 - b) for r, g, b in px]
    st = ImageStat.Stat(sm.convert('L'))
    return (sum(rg) + sum(yb)) / len(px) + st.stddev[0] * 0.6


def accent(im):
    sm = im.convert('RGB').resize((96, 60))
    best, score = None, 0
    buckets = {}
    for r, g, b in sm.get_flattened_data():
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if s < 0.35 or l < 0.18 or l > 0.85:
            continue
        k = int(h * 24)
        e = buckets.setdefault(k, [0, 0, 0, 0, 0])
        w = s * (1 - abs(l - 0.55))
        e[0] += r * w; e[1] += g * w; e[2] += b * w; e[3] += w; e[4] += 1
    for k, e in buckets.items():
        if e[4] < 25:
            continue
        sc = e[3]
        if sc > score:
            score, best = sc, e
    if not best:
        return None
    r, g, b = (best[0] / best[3], best[1] / best[3], best[2] / best[3])
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    r, g, b = colorsys.hls_to_rgb(h, min(max(l, 0.5), 0.62), max(s, 0.75))
    return '#%02X%02X%02X' % (int(r * 255), int(g * 255), int(b * 255))


def cover(im, w, h, ay=0.5):
    s = max(w / im.width, h / im.height)
    nw, nh = max(w, round(im.width * s)), max(h, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    x = (nw - w) // 2
    y = int((nh - h) * ay)
    return im.crop((x, y, x + w, y + h))


def fit_pad(im, w, h):
    """Fit the whole image inside w x h (keep aspect), extend edge rows/cols to fill (no crop)."""
    s = min(w / im.width, h / im.height)
    nw, nh = round(im.width * s), round(im.height * s)
    im = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGB', (w, h))
    x, y = (w - nw) // 2, (h - nh) // 2
    out.paste(im, (x, y))
    if y > 0:
        def band(row):
            c = ImageStat.Stat(row).median
            return tuple(int(v) for v in c[:3])
        out.paste(Image.new('RGB', (w, y), band(im.crop((0, 2, nw, 6)))), (0, 0))
        out.paste(Image.new('RGB', (w, h - y - nh), band(im.crop((0, nh - 6, nw, nh - 2)))), (0, y + nh))
        out.paste(im, (x, y))
    if x > 0:
        col = out.crop((x, 0, x + 1, h)).resize((x, h))
        out.paste(col, (0, 0))
        col = out.crop((x + nw - 1, 0, x + nw, h)).resize((w - x - nw, h))
        out.paste(col, (x + nw, 0))
    return out


def luma(im):
    return ImageStat.Stat(im.convert('L').resize((32, 20))).mean[0]


def main():
    os.makedirs(OUT + '/hero', exist_ok=True)
    sites = {}
    # captures (manifest, ranked) + extras
    VARS = ('landing', 'landing-dark', 'docs', 'docs-dark', 'full', 'components', 'components-dark', 'docs-intro', 'docs-intro-dark')
    def scan(d):
        v = {k: os.path.join(d, k + '.png') for k in VARS}
        return {k: p for k, p in v.items() if os.path.isfile(p)}
    for m in json.load(open(os.path.join(CAPS, 'manifest.json'))):
        if m['slug'] in EXCLUDE or m.get('director') == 'exclude':
            continue
        vars_ = scan(os.path.join(CAPS, m['slug']))
        if m['slug'] == 'hexaa':
            vars_ = {}  # director caution: only the repo OG card (no legible post headline)
        name = 'OpenCoven' if m['slug'] == 'opencoven' else m['name']
        sites[host(m['url'])] = {'slug': m['slug'], 'name': name, 'url': m['url'], 'caps': vars_, 'thumb': None, 'rank': m['rank']}
    for slug, (name, url) in EXTRAS.items():
        vars_ = scan(os.path.join(CAPS, 'extras', slug))
        if not vars_:
            continue
        h = host(url)
        if h in sites:
            sites[h]['caps'].update(vars_)
        else:
            sites[h] = {'slug': slug, 'name': name, 'url': url, 'caps': vars_, 'thumb': None}
    # repo thumbnails
    for e in parse_page():
        h = host(e['url'])
        thumb = os.path.join(THUMBS, e['thumb']) if e['thumb'] else None
        if h in sites:
            sites[h]['thumb'] = thumb
            continue
        if not thumb:
            continue
        slug = os.path.splitext(e['thumb'])[0]
        if slug in EXCLUDE:
            continue
        sites[h] = {'slug': slug, 'name': e['name'], 'url': e['url'], 'caps': {}, 'thumb': thumb}
    # host aliases (repo urls that differ from capture urls)
    order = sorted(sites.values(), key=lambda s: s['slug'])
    assert len(order) <= COLS * ROWS, len(order)

    atlas = Image.new('RGB', (AW, AH), INK)
    strips = Image.new('RGB', (SW * SCOLS, SH), INK)
    entries = []
    for i, s in enumerate(order):
        slug = s['slug']
        pref = TILE_PREF.get(slug)
        src = None
        if pref == 'og' and s['thumb']:
            src = s['thumb']
        elif pref and pref in s['caps']:
            src = s['caps'][pref]
        elif s['thumb']:
            src = s['thumb']
        else:
            cands = [s['caps'][k] for k in ('landing', 'landing-dark', 'docs', 'docs-dark') if k in s['caps']] or [p for k, p in s['caps'].items() if k != 'full']
            src = max(cands, key=lambda p: colourfulness(Image.open(p)))
        im = Image.open(src).convert('RGB')
        is_cap = '/assets/showcase/' in src
        r = im.width / im.height
        tile = cover(im, CW - 2 * BEZEL, CH - 2 * BEZEL, ay=0.0) if is_cap or abs(r - 1.6) < 0.08 else fit_pad(im, CW - 2 * BEZEL, CH - 2 * BEZEL)
        cx, cy = (i % COLS) * CW, (i // COLS) * CH
        atlas.paste(tile, (cx + BEZEL, cy + BEZEL))
        acc = accent(im) or '#FA8023'
        tone = 'dark' if luma(tile) < 110 else 'light'
        # night readability: bright, sparse pages (mostly white) read as blank slabs in the city
        small = tile.convert('L').resize((250, 154))
        px = list(small.get_flattened_data())
        lum = round(sum(px) / len(px))
        ink = round(sum(1 for p in px if p < 150) / len(px), 3)
        entry = {'slug': slug, 'name': s['name'], 'url': s['url'], 'host': host(s['url']), 'cell': i, 'strip': -1, 'accent': acc, 'tone': tone, 'lum': lum, 'ink': ink, 'tileSrc': os.path.relpath(src, ROOT)}
        # hero
        hv = HERO.get(slug)
        if hv:
            hp = s['thumb'] if hv == 'og' else s['caps'].get(hv)
            if hp:
                him = Image.open(hp).convert('RGB')
                if hv == 'og':
                    w = min(2400, him.width)
                    him = him.resize((w, round(him.height * w / him.width)), Image.LANCZOS)
                else:
                    him = cover(him, 2080, 1300, ay=0.0)
                fn = f'hero/{slug}.jpg'
                him.save(os.path.join(OUT, fn), quality=92)
                entry['hero'] = {'file': fn, 'w': him.width, 'h': him.height}
                entry['heroAccent'] = accent(him) or acc
                entry['heroTone'] = 'dark' if luma(him) < 110 else 'light'
        # strip
        if slug in STRIPS and 'full' in s['caps']:
            k = STRIPS.index(slug)
            fim = Image.open(s['caps']['full']).convert('RGB')
            fim = fim.resize((SW, round(fim.height * SW / fim.width)), Image.LANCZOS).crop((0, 0, SW, SH))
            strips.paste(fim, (k * SW, 0))
            entry['strip'] = k
            entry['stripH'] = min(SH, fim.height)
        entries.append(entry)
    atlas.save(OUT + '/atlas.jpg', quality=90)
    strips.save(OUT + '/strips.jpg', quality=88)

    lines = [
        '// GENERATED by mv/src/scenes/showcase/tools/build_assets.py (run with a Python that has Pillow) — do not edit by hand.',
        '// Sites shown in the showcase scene: repo showcase thumbnails + live captures (assets/showcase).',
        'export interface SiteInfo {',
        '  slug: string;',
        '  name: string;',
        '  url: string;',
        '  host: string;',
        '  /** atlas cell index (row-major) */',
        '  cell: number;',
        '  /** scroll-strip column, -1 if none */',
        '  strip: number;',
        '  stripH?: number;',
        '  accent: string;',
        "  tone: 'dark' | 'light';",
        '  /** mean tile luma 0–255 and the share of dark (ink) pixels: bright sparse pages read as blank slabs at night */',
        '  lum: number;',
        '  ink: number;',
        '  hero?: { file: string; w: number; h: number };',
        '  heroAccent?: string;',
        "  heroTone?: 'dark' | 'light';",
        '}',
        f"export const ATLAS = {{ file: 'atlas.jpg', w: {AW}, h: {AH}, cols: {COLS}, rows: {ROWS}, cw: {CW}, ch: {CH}, bezel: {BEZEL} }} as const;",
        f"export const STRIPS = {{ file: 'strips.jpg', w: {SW * SCOLS}, h: {SH}, cols: {SCOLS}, sw: {SW} }} as const;",
        'export const SITES: SiteInfo[] = [',
    ]
    for e in entries:
        e = {k: v for k, v in e.items() if k != 'tileSrc'}
        lines.append('  ' + json.dumps(e, ensure_ascii=False) + ',')
    lines.append('];')
    open(GEN, 'w', encoding='utf8').write('\n'.join(lines) + '\n')
    print(len(entries), 'sites')
    for e in entries:
        print(f"{e['cell']:3d} {e['slug']:22s} {e['tone']:5s} {e['accent']}  {e.get('hero', {}).get('file', '')}  strip={e['strip']}  <- {e['tileSrc']}")


main()
