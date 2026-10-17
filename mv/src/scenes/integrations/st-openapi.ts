import { clamp, ease, hold, lerp, seg, TAU } from '../../engine/anim';
import { brackets, measure, pctTag, rectP, text } from '../../engine/draw2d';
import { bt, fr, KEY, ORANGE, ringLocalY, T } from './k';
import { Route } from './route';
import type { StationCtx, StationImpl } from './station';
import { backlight, button, card, chevronDown, FD, fileIcon, METHOD, mono, rr, screenGlass, skel, SYN, type Tok, toks, ui, xIcon } from './ui';
import { hexA } from './world';
import { hasOpenAPIPlates, plates } from './plates';

const K = KEY.openapi;
/** linework / labels drawn over the lit chartreuse field */
const A = '#0A0A0B';
const b = (n: number) => bt(T.drop, n); // beat n of block 01

// ── layout (station-local px) ────────────────────────────────────────────────
const Y = { x: 84, y: 214, w: 548, head: 44, lh: 26, fs: 16 };
const YAML: Tok[][] = [
  [['openapi', SYN.key], [': ', SYN.punct], ['3.1.1', SYN.num]],
  [['info', SYN.key], [':', SYN.punct]],
  [['  title', SYN.key], [': ', SYN.punct], ['Scalar Galaxy', SYN.str]],
  [['servers', SYN.key], [':', SYN.punct]],
  [['  - ', SYN.punct], ['url', SYN.key], [': ', SYN.punct], ['https://galaxy.scalar.com', SYN.str]],
  [['paths', SYN.key], [':', SYN.punct]],
  [['  /planets', SYN.key], [':', SYN.punct]],
  [['    post', SYN.key], [':', SYN.punct]],
  [['      tags', SYN.key], [': [', SYN.punct], ['Planets', SYN.str], [']', SYN.punct]],
  [['      summary', SYN.key], [': ', SYN.punct], ['Create a planet', SYN.str]],
  [['      operationId', SYN.key], [': ', SYN.punct], ['createPlanet', SYN.str]],
  [['      requestBody', SYN.key], [':', SYN.punct]],
  [['        content', SYN.key], [':', SYN.punct]],
  [['          application/json', SYN.key], [':', SYN.punct]],
  [['            schema', SYN.key], [':', SYN.punct]],
  [['              $ref', SYN.key], [': ', SYN.punct], ["'#/…/schemas/Planet'", SYN.str]],
  [['      responses', SYN.key], [':', SYN.punct]],
  [["        '201'", SYN.num], [':', SYN.punct]],
  [['          description', SYN.key], [': ', SYN.punct], ['Created', SYN.str]],
];
const Y_H = Y.head + 14 + YAML.length * Y.lh + 12;
const KEY_LINES = [6, 7, 9, 17];
const lineY = (i: number) => Y.y + Y.head + 14 + i * Y.lh + Y.lh * 0.72;
const GUT = Y.x + 46; // code x after the line-number gutter

const P = { x: 668, y: 150, w: 1164, h: 700 };
const PX0 = P.x + 46; // left column x
const PCW = 610; // left column width
const RC = { x: P.x + 712, w: 408 }; // right column
const EB = { x: PX0, y: P.y + 212, w: PCW, h: 58 }; // endpoint bar
const TITLE = { x: PX0, y: P.y + 136, fs: 40 };

const D = { x: 706, y: 168, w: 1088, h: 616 };
const URL = { x: D.x + 24, y: D.y + 74, w: D.w - 48, h: 56 };
const SPLIT = { x: D.x + 24, y: D.y + 150, w: D.w - 48, h: D.h - 174 };
const LW = Math.round((SPLIT.w * 11) / 20);
const RP = { x: SPLIT.x + LW, w: SPLIT.w - LW };
const TABS = ['cURL', 'JavaScript', 'Go', 'Python', 'Java', 'C#', 'Rust'];
const TAB_Y = SPLIT.y + 40;
const SERVER = { x: 1420, y: 66 };

// times
const tScan0 = fr(77.12), tScan1 = fr(77.42);
const tFly = [b(2.5), b(2.75), b(3), b(3.25)]; // 16ths: title, method, path, 201 → page complete ~77.96
const tTry = b(4), tSend = b(5), tResp = b(6), tTabs = b(7);
/** b7: the dialog closes and the spec gets stamped as the camera snaps wide */
const tStamp = tTabs;
const tIn = 77.0, tOut = 79.72;
const xe = 46, xx = 1846;

// geometry of the moving parts (computed once fonts are measurable → lazily)
let sendRect = { x: 0, y: 0, w: 0, h: 0 };

const route = new Route([
  // up the left margin from the ring, into the gutter at /planets
  { t0: tIn, t1: tScan0, pts: [[xe, ringLocalY(xe)], [xe, lineY(6) - 5], [Y.x + 22, lineY(6) - 5]], e: ease.outCubic },
  // reading head down the gutter
  { t0: tScan0, t1: tScan1, pts: [[Y.x + 22, lineY(6) - 5], [Y.x + 22, lineY(18) - 5]], e: ease.linear },
  // out of the spec, across to the endpoint bar, along it to "Try in Playground"
  { t0: tScan1, t1: tTry - 0.03, pts: [[Y.x + 22, lineY(18) - 5], [Y.x + 22, Y.y + Y_H + 22], [EB.x - 18, Y.y + Y_H + 22], [EB.x - 18, EB.y + EB.h + 14], [EB.x + EB.w - 110, EB.y + EB.h + 14], [EB.x + EB.w - 110, EB.y + EB.h / 2]], e: ease.inOutCubic },
  // to the Send button in the playground
  { t0: tTry + 0.06, t1: tSend - 0.12, pts: [[EB.x + EB.w - 110, EB.y + EB.h / 2], [D.x + D.w - 110, URL.y + URL.h / 2]], e: ease.inOutCubic },
  // fired to the server and back with the response
  { t0: tSend, t1: tSend + 0.17, pts: [[D.x + D.w - 110, URL.y + URL.h / 2], [SERVER.x, SERVER.y]], e: ease.outCubic },
  { t0: tSend + 0.2, t1: tResp, pts: [[SERVER.x, SERVER.y], [RP.x + 28, SPLIT.y + 236]], e: ease.inCubic },
  // tab indicator ride
  { t0: tTabs, t1: tTabs + 0.42, pts: [[RP.x + 28, SPLIT.y + 236], [RP.x + 28, TAB_Y + 14], [RP.x + RP.w - 30, TAB_Y + 14]], e: ease.linear },
  // exit: right, then down to the ring
  { t0: tOut - 0.12, t1: tOut, pts: [[RP.x + RP.w - 30, TAB_Y + 14], [xx, TAB_Y + 14], [xx, ringLocalY(xx)]], e: ease.inCubic },
]);

// ── plate layout (real captures; css px → station-local px) ─────────────────
// operation page: css region [500, 30, 1164, 700] shown 1:1 in P
const opX = (x: number) => x - 500 + P.x;
const opY = (y: number) => y - 30 + P.y;
// playground dialog: css [320, 124, 1280, 832] scaled by KD
const KD = 0.92;
const DP = { x: 700, y: 108, w: 1280 * KD, h: 832 * KD };
const dlX = (x: number) => DP.x + (x - 320) * KD;
const dlY = (y: number) => DP.y + (y - 124) * KD;
const PL = {
  title: [opX(542), opY(125)] as [number, number],
  method: [opX(557), opY(177)] as [number, number],
  path: [opX(598), opY(177)] as [number, number],
  s201: [opX(1263), opY(385)] as [number, number],
  tryBtn: [opX(1075.8 + 69.6), opY(158 + 14)] as [number, number],
  eb: { x: opX(542), y: opY(150), w: 680, h: 44 },
  send: [dlX(1465.1 + 59), dlY(173 + 20)] as [number, number],
  resp: [dlX(1037), dlY(482)] as [number, number],
  tabs: [1280.5, 1349.5, 1410, 1459, 1513.5, 1554.5, 1594].map((x) => [opX(x), opY(183)] as [number, number]),
};
const tClose = tTabs, tFlip0 = tTabs + 0.1;
const plateRoute = new Route([
  { t0: tIn, t1: tScan0, pts: [[xe, ringLocalY(xe)], [xe, lineY(6) - 5], [Y.x + 22, lineY(6) - 5]], e: ease.outCubic },
  { t0: tScan0, t1: tScan1, pts: [[Y.x + 22, lineY(6) - 5], [Y.x + 22, lineY(18) - 5]], e: ease.linear },
  { t0: tScan1, t1: tTry - 0.03, pts: [[Y.x + 22, lineY(18) - 5], [Y.x + 22, Y.y + Y_H + 22], [PL.eb.x - 18, Y.y + Y_H + 22], [PL.eb.x - 18, PL.eb.y + PL.eb.h + 14], [PL.tryBtn[0], PL.eb.y + PL.eb.h + 14], PL.tryBtn], e: ease.inOutCubic },
  { t0: tTry + 0.06, t1: tSend - 0.12, pts: [PL.tryBtn, PL.send], e: ease.inOutCubic },
  { t0: tSend, t1: tSend + 0.17, pts: [PL.send, [SERVER.x, SERVER.y]], e: ease.outCubic },
  { t0: tSend + 0.2, t1: tResp, pts: [[SERVER.x, SERVER.y], PL.resp], e: ease.inCubic },
  // after the dialog closes: onto the page's code tabs, riding them with the flips
  { t0: tClose + 0.04, t1: tFlip0, pts: [PL.resp, PL.tabs[0]], e: ease.inOutCubic },
  { t0: tFlip0, t1: tFlip0 + 0.4, pts: [PL.tabs[0], PL.tabs[4]], e: ease.linear },
  { t0: tOut - 0.12, t1: tOut, pts: [PL.tabs[4], [xx, PL.tabs[4][1]], [xx, ringLocalY(xx)]], e: ease.inCubic },
]);
const usePlates = () => hasOpenAPIPlates();
const activeRoute = () => (usePlates() ? plateRoute : route);

// ── pieces ───────────────────────────────────────────────────────────────────

function yamlCard(c: CanvasRenderingContext2D, t: number, a: number) {
  c.save();
  c.globalAlpha *= a;
  backlight(c, Y.x, Y.y, Y.w, Y_H, 14);
  card(c, Y.x, Y.y, Y.w, Y_H, { r: 14, fill: FD.card });
  // title bar
  c.fillStyle = 'rgba(255,255,255,0.025)';
  rr(c, Y.x, Y.y, Y.w, Y.head, 14);
  c.fill();
  c.fillStyle = FD.border;
  c.fillRect(Y.x, Y.y + Y.head, Y.w, 1);
  fileIcon(c, Y.x + 16, Y.y + 13, 18, FD.mutedFg);
  mono(c, 'openapi.yaml', Y.x + 42, Y.y + 28, 14.5, { color: FD.mutedFg });
  // scan bar + persistent key-line highlights
  const scanY = lerp(lineY(6), lineY(18), clamp((t - tScan0) / (tScan1 - tScan0)));
  for (const i of KEY_LINES) {
    const tl = tScan0 + ((lineY(i) - lineY(6)) / (lineY(18) - lineY(6))) * (tScan1 - tScan0);
    const on = seg(t, tl, tl + 0.08, ease.outCubic);
    if (on <= 0) continue;
    c.fillStyle = hexA(K, 0.13 * on);
    c.fillRect(Y.x + 1, lineY(i) - Y.lh * 0.72, Y.w - 2, Y.lh);
    c.fillStyle = hexA(K, 0.9 * on);
    c.fillRect(Y.x + 1, lineY(i) - Y.lh * 0.72, 2, Y.lh);
  }
  if (t > tScan0 && t < tScan1 + 0.05) {
    const g = c.createLinearGradient(0, scanY - 40, 0, scanY + 6);
    g.addColorStop(0, hexA(K, 0));
    g.addColorStop(1, hexA(K, 0.22));
    c.fillStyle = g;
    c.fillRect(Y.x + 1, scanY - 40, Y.w - 2, 46);
  }
  // code (types on during the boot, 2 lines per frame)
  const boot = clamp((t - 76.86) / 0.3);
  const shownLines = Math.floor(boot * YAML.length * 1.4);
  for (let i = 0; i < YAML.length; i++) {
    if (i >= shownLines) break;
    const y = lineY(i);
    text(c, String(i + 1).padStart(2, ' '), Y.x + 14, y, { font: 'code', size: 13, color: 'rgba(179,179,179,0.35)' });
    const chars = (shownLines - i) * 12;
    toks(c, YAML[i], GUT, y, Y.fs, 'code', chars);
  }
  screenGlass(c, Y.x, Y.y, Y.w, Y_H, 14);
  c.restore();
}

/** Where a YAML token sits (for the flights). */
function tokenPos(c: CanvasRenderingContext2D, line: number, before: string): [number, number] {
  const w = measure(c, before, { font: 'code', size: Y.fs });
  return [GUT + w, lineY(line)];
}

function methodFlap(c: CanvasRenderingContext2D, t: number, x: number, y: number, size: number) {
  // flap through GET → PUT → DELETE → POST, 3 frames each, landing on POST
  const seq = ['GET', 'PUT', 'DELETE', 'PATCH', 'POST'];
  const f = Math.min(seq.length - 1, Math.floor(Math.max(0, t - tFly[1] - 0.12) * 20));
  const m = seq[f];
  const roll = f < seq.length - 1 ? (((t - tFly[1] - 0.12) * 20) % 1) : 0;
  c.save();
  c.beginPath();
  c.rect(x - 4, y - size, 90, size * 1.4);
  c.clip();
  mono(c, m, x, y - roll * size * 0.5, size, { weight: 500, color: METHOD[m] });
  c.restore();
  return measure(c, 'POST', { font: 'mono', size, weight: 500 });
}

function pageCard(c: CanvasRenderingContext2D, t: number, a: number) {
  c.save();
  c.globalAlpha *= a;
  card(c, P.x, P.y, P.w, P.h, { r: 16, fill: FD.bg });
  // breadcrumb
  ui(c, 'API Reference', PX0, P.y + 66, 15, { color: FD.mutedFg });
  ui(c, '›  Planets', PX0 + 112, P.y + 66, 15, { color: FD.mutedFg });
  // title: skeleton until the token lands
  const titleOn = seg(t, tFly[0] + 0.16, tFly[0] + 0.2);
  if (titleOn < 1) skel(c, TITLE.x, TITLE.y - 30, 330, 34, 1 - titleOn);
  if (titleOn > 0) ui(c, 'Create a planet', TITLE.x, TITLE.y, TITLE.fs, { weight: 600, alpha: titleOn });
  // description arrives with the schema
  const descOn = seg(t, tFly[3] + 0.1, tFly[3] + 0.22);
  if (descOn < 1) skel(c, PX0, P.y + 166, 420, 16, 1 - descOn);
  ui(c, 'Time to play god and create a new planet.', PX0, P.y + 180, 18, { color: FD.mutedFg, alpha: descOn });
  // endpoint bar
  card(c, EB.x, EB.y, EB.w, EB.h, { r: 14, fill: FD.card });
  const mOn = t >= tFly[1] + 0.12;
  if (mOn) methodFlap(c, t, EB.x + 18, EB.y + EB.h / 2 + 6, 17);
  else skel(c, EB.x + 18, EB.y + 21, 46, 16);
  const pOn = seg(t, tFly[2] + 0.12, tFly[2] + 0.15);
  if (pOn > 0) {
    const x0 = EB.x + 18 + 62;
    mono(c, '/', x0, EB.y + EB.h / 2 + 6, 17, { color: FD.mutedFg, alpha: pOn });
    mono(c, 'planets', x0 + 11, EB.y + EB.h / 2 + 6, 17, { alpha: pOn });
  } else skel(c, EB.x + 80, EB.y + 21, 110, 16);
  const press = clamp(1 - Math.abs(t - tTry) / 0.08);
  const bw = measure(c, 'Try in Playground', { font: 'ui', size: 15, weight: 500 }) + 15 * 1.6 + 40 * 0.7;
  button(c, 'Try in Playground', EB.x + EB.w - bw - 9, EB.y + 9, 40, { primary: true, icon: 'play', size: 15, press });
  // request body (cascades in from the schema)
  ui(c, 'Request Body', PX0, P.y + 334, 24, { weight: 600 });
  const rows: [string, string, string, string][] = [
    ['name', '*', 'string', 'The name of the planet'],
    ['description', '?', 'string', 'A short description'],
    ['type', '?', '"terrestrial" | "gas_giant" | …', 'The type of planet'],
    ['habitabilityIndex', '?', 'number', '0 – 1'],
  ];
  for (let i = 0; i < rows.length; i++) {
    const on = seg(t, tFly[3] + 0.08 + i * 0.03, tFly[3] + 0.16 + i * 0.03, ease.outCubic);
    const y = P.y + 388 + i * 72;
    c.fillStyle = FD.border;
    c.fillRect(PX0, y - 30, PCW, 1);
    if (on < 1) {
      skel(c, PX0, y - 16, 120, 15, 1 - on);
      skel(c, PX0, y + 12, 220, 12, 1 - on);
    }
    if (on <= 0) continue;
    c.save();
    c.globalAlpha *= on;
    const [nm, req, ty, desc] = rows[i];
    const w = mono(c, nm, PX0, y, 17, { weight: 500, color: FD.primary });
    mono(c, req, PX0 + w + 2, y, 17, { color: req === '*' ? '#FF6467' : FD.mutedFg });
    mono(c, ty, PX0 + w + 26, y, 15, { color: FD.mutedFg });
    ui(c, desc, PX0, y + 28, 15, { color: FD.mutedFg });
    c.restore();
  }
  // right column: code sample + response example
  const rcOn = seg(t, tFly[3] + 0.06, tFly[3] + 0.2, ease.outCubic);
  card(c, RC.x, P.y + 56, RC.w, 300, { r: 12, fill: FD.card });
  card(c, RC.x, P.y + 376, RC.w, 290, { r: 12, fill: FD.card });
  if (rcOn > 0) {
    c.save();
    c.globalAlpha *= rcOn;
    let tx = RC.x + 16;
    for (const [i, tb] of ['cURL', 'JavaScript', 'Go', 'Python'].entries()) {
      const w = ui(c, tb, tx, P.y + 90, 14, { weight: 500, color: i === 0 ? FD.fg : FD.mutedFg });
      if (i === 0) {
        c.fillStyle = FD.fg;
        c.fillRect(tx, P.y + 104, w, 2);
      }
      tx += w + 22;
    }
    const curl: Tok[][] = [
      [['curl', SYN.fn], [' -X ', SYN.plain], ['POST', SYN.str], [' \\', SYN.plain]],
      [['  https://galaxy.scalar.com/planets', SYN.str], [' \\', SYN.plain]],
      [['  -H ', SYN.plain], ['"Content-Type: application/json"', SYN.str]],
      [['  -d ', SYN.plain], ["'{ \"name\": \"Mars\" }'", SYN.str]],
    ];
    curl.forEach((l, i) => toks(c, l, RC.x + 16, P.y + 146 + i * 26, 14, 'mono'));
    ui(c, '201', RC.x + 16, P.y + 410, 14, { weight: 500 });
    c.fillStyle = FD.fg;
    c.fillRect(RC.x + 16, P.y + 424, 25, 2);
    ui(c, '400', RC.x + 60, P.y + 410, 14, { weight: 500, color: FD.mutedFg });
    const js: Tok[][] = [[['{', SYN.punct]], [['  "id"', SYN.num], [': ', SYN.punct], ['1', SYN.num], [',', SYN.punct]], [['  "name"', SYN.num], [': ', SYN.punct], ['"Mars"', SYN.str], [',', SYN.punct]], [['  "type"', SYN.num], [': ', SYN.punct], ['"terrestrial"', SYN.str]], [['}', SYN.punct]]];
    js.forEach((l, i) => toks(c, l, RC.x + 16, P.y + 466 + i * 26, 14, 'mono'));
    c.restore();
  } else {
    for (let i = 0; i < 4; i++) skel(c, RC.x + 16, P.y + 130 + i * 26, 200 + ((i * 53) % 120), 12);
  }
  c.restore();
}

const CODES: Record<string, Tok[][]> = {
  cURL: [
    [['curl', SYN.fn], [' -X ', SYN.plain], ['POST', SYN.str], [' https://galaxy…/planets', SYN.str]],
    [['  -H ', SYN.plain], ['"Content-Type: application/json"', SYN.str]],
    [['  -d ', SYN.plain], ["'{ \"name\": \"Mars\", … }'", SYN.str]],
  ],
  JavaScript: [
    [['const ', SYN.kw], ['res', SYN.plain], [' = ', SYN.kw], ['await ', SYN.kw], ['fetch', SYN.fn], ['(', SYN.plain]],
    [['  "https://galaxy.scalar.com/planets"', SYN.str], [',', SYN.plain]],
    [['  { method: ', SYN.plain], ['"POST"', SYN.str], [', body }', SYN.plain], [')', SYN.plain]],
  ],
  Go: [
    [['req', SYN.plain], [', _ := ', SYN.kw], ['http', SYN.plain], ['.', SYN.plain], ['NewRequest', SYN.fn], ['(', SYN.plain]],
    [['  "POST"', SYN.str], [', ', SYN.plain], ['url', SYN.plain], [', ', SYN.plain], ['body', SYN.plain], [')', SYN.plain]],
    [['res', SYN.plain], [', _ := ', SYN.kw], ['client', SYN.plain], ['.', SYN.plain], ['Do', SYN.fn], ['(req)', SYN.plain]],
  ],
  Python: [
    [['import ', SYN.kw], ['requests', SYN.plain]],
    [['res', SYN.plain], [' = ', SYN.kw], ['requests', SYN.plain], ['.', SYN.plain], ['post', SYN.fn], ['(', SYN.plain]],
    [['  "https://galaxy.scalar.com/planets"', SYN.str], [', json=body)', SYN.plain]],
  ],
  Java: [
    [['HttpRequest', SYN.plain], [' req = ', SYN.kw], ['HttpRequest', SYN.plain], ['.', SYN.plain], ['newBuilder', SYN.fn], ['()', SYN.plain]],
    [['  .uri', SYN.fn], ['(URI.', SYN.plain], ['create', SYN.fn], ['(url))', SYN.plain]],
    [['  .POST', SYN.fn], ['(BodyPublishers.', SYN.plain], ['ofString', SYN.fn], ['(body))', SYN.plain]],
  ],
  'C#': [
    [['using ', SYN.kw], ['var', SYN.kw], [' client = ', SYN.plain], ['new ', SYN.kw], ['HttpClient', SYN.fn], ['();', SYN.plain]],
    [['var ', SYN.kw], ['res', SYN.plain], [' = ', SYN.kw], ['await ', SYN.kw], ['client', SYN.plain], ['.', SYN.plain], ['PostAsync', SYN.fn], ['(', SYN.plain]],
    [['  url', SYN.plain], [', content);', SYN.plain]],
  ],
  Rust: [
    [['let ', SYN.kw], ['res', SYN.plain], [' = ', SYN.kw], ['client', SYN.plain], ['.', SYN.plain], ['post', SYN.fn], ['(url)', SYN.plain]],
    [['  .json', SYN.fn], ['(&body)', SYN.plain]],
    [['  .send', SYN.fn], ['().', SYN.plain], ['await', SYN.kw], ['?;', SYN.plain]],
  ],
};

const RESP: Tok[][] = [
  [['{', SYN.punct]],
  [['  "id"', SYN.num], [': ', SYN.punct], ['1', SYN.num], [',', SYN.punct]],
  [['  "name"', SYN.num], [': ', SYN.punct], ['"Mars"', SYN.str], [',', SYN.punct]],
  [['  "description"', SYN.num], [': ', SYN.punct], ['"The red planet"', SYN.str], [',', SYN.punct]],
  [['  "type"', SYN.num], [': ', SYN.punct], ['"terrestrial"', SYN.str], [',', SYN.punct]],
  [['  "habitabilityIndex"', SYN.num], [': ', SYN.punct], ['0.68', SYN.num]],
  [['}', SYN.punct]],
];

const BODY: Tok[][] = [
  [['{', SYN.punct]],
  [['  "name"', SYN.num], [': ', SYN.punct], ['"Mars"', SYN.str], [',', SYN.punct]],
  [['  "description"', SYN.num], [': ', SYN.punct], ['"The red planet"', SYN.str], [',', SYN.punct]],
  [['  "type"', SYN.num], [': ', SYN.punct], ['"terrestrial"', SYN.str]],
  [['}', SYN.punct]],
];

function tabIndex(t: number) {
  return t < tTabs ? 0 : Math.min(TABS.length - 1, Math.floor((t - tTabs) / 0.1 + 1e-6));
}

function dialog(c: CanvasRenderingContext2D, t: number, open: number) {
  if (open <= 0) return;
  // spring out of the "Try in Playground" button
  const bx = EB.x + EB.w - 110, by = EB.y + EB.h / 2;
  // uniform pop (2D scale from the button), no axis-squash
  const k = lerp(0.1, 1, ease.outBack(open, 1.1));
  const cx = lerp(bx, D.x + D.w / 2, ease.outCubic(open)), cy = lerp(by, D.y + D.h / 2, ease.outCubic(open));
  c.save();
  c.translate(cx, cy);
  c.scale(k, k);
  c.translate(-(D.x + D.w / 2), -(D.y + D.h / 2));
  c.globalAlpha *= clamp(open * 3);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 40;
  c.shadowOffsetY = 12;
  card(c, D.x, D.y, D.w, D.h, { r: 18, fill: FD.popover });
  c.restore();
  card(c, D.x, D.y, D.w, D.h, { r: 18, fill: FD.popover });
  // header
  ui(c, 'Create a planet', D.x + 28, D.y + 46, 21, { weight: 600 });
  const exW = ui(c, 'Example', D.x + D.w - 170, D.y + 46, 14, { color: FD.mutedFg });
  chevronDown(c, D.x + D.w - 170 + exW + 4, D.y + 32, 16, FD.mutedFg);
  xIcon(c, D.x + D.w - 48, D.y + 30, 20, FD.mutedFg);
  // URL bar
  card(c, URL.x, URL.y, URL.w, URL.h, { r: 12, fill: FD.secondary });
  rr(c, URL.x + 10, URL.y + 12, 64, 32, 8);
  c.fillStyle = hexA(METHOD.POST, 0.1);
  c.fill();
  mono(c, 'POST', URL.x + 22, URL.y + 34, 15, { weight: 500, color: METHOD.POST });
  const sw = mono(c, 'galaxy.scalar.com', URL.x + 90, URL.y + 34, 15, { color: FD.mutedFg });
  chevronDown(c, URL.x + 92 + sw, URL.y + 21, 14, FD.mutedFg);
  mono(c, '/planets', URL.x + 116 + sw, URL.y + 34, 16);
  const press = Math.max(clamp(1 - Math.abs(t - tSend - 0.03) / 0.07), 0);
  const sendW = measure(c, 'Send', { font: 'ui', size: 16, weight: 500 }) + 16 * 1.6 + measure(c, '⌘ ↵', { font: 'mono', size: 16 * 0.8 }) + 16 * 1.1 + 40 * 0.7;
  sendRect = { x: URL.x + URL.w - sendW - 8, y: URL.y + 8, w: sendW, h: 40 };
  button(c, 'Send', sendRect.x, sendRect.y, 40, { primary: true, icon: 'send', kbd: '⌘ ↵', size: 16, press });
  // ripple on send
  const rp = clamp((t - tSend) / 0.3);
  if (rp > 0 && rp < 1) {
    c.strokeStyle = hexA(K, 1 - rp);
    c.lineWidth = 2;
    rr(c, sendRect.x - 14 * rp, sendRect.y - 14 * rp, sendRect.w + 28 * rp, sendRect.h + 28 * rp, 12 + 10 * rp);
    c.stroke();
  }
  // split card
  card(c, SPLIT.x, SPLIT.y, SPLIT.w, SPLIT.h, { r: 14, fill: FD.card });
  c.fillStyle = FD.border;
  c.fillRect(RP.x, SPLIT.y + 1, 1, SPLIT.h - 2);
  // left: Body (JSON)
  ui(c, 'Body', SPLIT.x + 20, SPLIT.y + 38, 16, { weight: 500 });
  const segX = SPLIT.x + LW - 150;
  rr(c, segX, SPLIT.y + 16, 130, 32, 8);
  c.fillStyle = FD.secondary;
  c.fill();
  rr(c, segX + 66, SPLIT.y + 19, 61, 26, 6);
  c.fillStyle = FD.popover;
  c.fill();
  ui(c, 'Form', segX + 14, SPLIT.y + 37, 13, { color: FD.mutedFg });
  ui(c, 'JSON', segX + 80, SPLIT.y + 37, 13, { weight: 500 });
  card(c, SPLIT.x + 20, SPLIT.y + 64, LW - 40, 168, { r: 10, fill: FD.bg });
  BODY.forEach((l, i) => toks(c, l, SPLIT.x + 36, SPLIT.y + 96 + i * 28, 16, 'mono'));
  ui(c, 'Header', SPLIT.x + 20, SPLIT.y + 274, 16, { weight: 500 });
  mono(c, 'Content-Type', SPLIT.x + 20, SPLIT.y + 312, 14, { color: FD.mutedFg });
  mono(c, 'application/json', SPLIT.x + 190, SPLIT.y + 312, 14);
  ui(c, 'Path · Query · Cookies', SPLIT.x + 20, SPLIT.y + 354, 14, { color: 'rgba(179,179,179,0.45)' });
  // right: code tabs
  const ti = tabIndex(t);
  let tx = RP.x + 20;
  c.save();
  c.beginPath();
  c.rect(RP.x + 1, SPLIT.y, RP.w - 2, 60);
  c.clip();
  const scroll = ti >= 4 ? -(ti - 3) * 70 : 0;
  for (let i = 0; i < TABS.length; i++) {
    const x = tx + scroll;
    const w = ui(c, TABS[i], x, TAB_Y + 6, 14, { weight: 500, color: i === ti ? FD.fg : FD.mutedFg });
    if (i === ti) {
      c.fillStyle = K;
      c.fillRect(x, TAB_Y + 20, w, 2);
    }
    tx += w + 22;
  }
  c.restore();
  c.fillStyle = FD.border;
  c.fillRect(RP.x + 1, TAB_Y + 22, RP.w - 2, 1);
  const code = CODES[TABS[ti]];
  code.forEach((l, i) => toks(c, l, RP.x + 20, TAB_Y + 60 + i * 24, 13.5, 'mono'));
  // response panel
  const ry = SPLIT.y + 196;
  c.fillStyle = FD.border;
  c.fillRect(RP.x + 1, ry, RP.w - 2, 1);
  if (t < tSend) {
    ui(c, 'Send a request to see its response.', RP.x + RP.w / 2, ry + 120, 14, { color: FD.mutedFg, align: 'center' });
  } else if (t < tResp) {
    // sending: spinner
    const a0 = (t - tSend) * TAU * 2.2;
    c.strokeStyle = FD.mutedFg;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(RP.x + RP.w / 2, ry + 100, 12, a0, a0 + 4.2);
    c.stroke();
    ui(c, 'Sending request...', RP.x + RP.w / 2, ry + 140, 14, { color: FD.mutedFg, align: 'center' });
  } else {
    const fl = seg(t, tResp, tResp + 0.12);
    c.fillStyle = '#22C55E';
    c.beginPath();
    c.arc(RP.x + 26, ry + 30, 5, 0, TAU);
    c.fill();
    const w1 = mono(c, '201', RP.x + 40, ry + 36, 16, { weight: 600 });
    const w2 = ui(c, 'Created', RP.x + 46 + w1, ry + 36, 15, { color: FD.mutedFg });
    mono(c, '143 ms · 750 B', RP.x + 62 + w1 + w2, ry + 36, 12.5, { color: FD.mutedFg });
    // Body | Headers
    rr(c, RP.x + RP.w - 146, ry + 15, 130, 28, 7);
    c.fillStyle = FD.secondary;
    c.fill();
    ui(c, 'Body', RP.x + RP.w - 134, ry + 34, 12.5, { weight: 500 });
    ui(c, 'Headers 6', RP.x + RP.w - 88, ry + 34, 12.5, { color: FD.mutedFg });
    const shown = Math.floor((t - tResp) / 0.04);
    RESP.forEach((l, i) => {
      if (i <= shown) toks(c, l, RP.x + 20, ry + 72 + i * 22, 13, 'mono');
    });
    if (fl < 1) {
      c.fillStyle = hexA(K, 0.25 * (1 - fl));
      c.fillRect(RP.x + 1, ry + 1, RP.w - 2, 50);
    }
  }
  c.restore();
}

/** b6 accent: chartreuse block slams over the spec with a giant 201. */
function stamp(c: CanvasRenderingContext2D, t: number) {
  const p = seg(t, tStamp - 0.02, tStamp + 0.07, ease.outCubic);
  if (p <= 0) return;
  const x = Y.x, w = Y.w, y1 = Y.y + Y_H;
  const h = Y_H * p;
  c.save();
  rr(c, x, y1 - h, w, h, 14);
  c.fillStyle = '#0A0A0B';
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = K;
  c.stroke();
  c.clip();
  const ty = y1 - h;
  const kick = 1 + 0.18 * (1 - seg(t, tStamp, tStamp + 0.25, ease.outCubic));
  c.save();
  c.translate(x + w / 2, ty + 270);
  c.scale(kick, kick);
  text(c, '201', 0, 0, { font: 'display', size: 300, weight: 900, stretch: 'condensed', align: 'center', color: K, tracking: -0.04, baseline: 'middle' });
  c.restore();
  text(c, 'CREATED', x + w / 2, ty + 450, { font: 'wide', size: 34, align: 'center', tracking: 0.42, color: '#FAFAF7' });
  text(c, 'HTTP/1.1 201', x + 22, ty + 40, { font: 'mono', size: 13, color: K });
  text(c, 'application/json · 143 ms', x + w - 22, ty + 40, { font: 'mono', size: 13, align: 'right', color: K });
  text(c, 'POST /planets', x + 22, ty + Y_H - 26, { font: 'mono', size: 13, color: K });
  text(c, '作成済み', x + w - 22, ty + Y_H - 26, { font: 'jpKaku', size: 15, weight: 900, align: 'right', color: '#FAFAF7' });
  c.restore();
}

function server(c: CanvasRenderingContext2D, t: number, s: number) {
  const on = seg(t, tSend - 0.1, tSend + 0.05);
  if (on <= 0) return;
  const ping = clamp((t - (tSend + 0.17)) / 0.35);
  c.save();
  c.globalAlpha *= on;
  rr(c, SERVER.x - 13, SERVER.y - 13, 26, 26, 6);
  c.fillStyle = '#0A0A0B';
  c.fill();
  c.lineWidth = 1.5 / s;
  c.strokeStyle = K;
  c.stroke();
  for (let i = 0; i < 3; i++) {
    c.fillStyle = hexA(K, 0.9);
    c.fillRect(SERVER.x - 7, SERVER.y - 7 + i * 6, 14, 2);
  }
  if (ping > 0 && ping < 1) {
    c.strokeStyle = hexA(A, 1 - ping);
    c.beginPath();
    c.arc(SERVER.x, SERVER.y, 16 + 50 * ease.outCubic(ping), 0, TAU);
    c.stroke();
  }
  text(c, 'galaxy.scalar.com', SERVER.x + 24, SERVER.y + 5, { font: 'mono', size: 14, weight: 600, color: A });
  c.restore();
}

/** Circuit lines: ring → spec, spec → page, Send ⇄ server, page → exit. */
function circuits(c: CanvasRenderingContext2D, t: number, s: number) {
  c.save();
  c.lineWidth = 2 / s;
  c.strokeStyle = hexA(A, 0.85);
  c.setLineDash([]);
  const legs = activeRoute().legs;
  const drawLeg = (i: number, until = t, dash = false) => {
    const l = legs[i];
    if (until < l.t0) return;
    const sub = new Route([l]);
    c.setLineDash(dash ? [6 / s, 6 / s] : []);
    if (sub.trace(c, until)) c.stroke();
  };
  drawLeg(0);
  drawLeg(2);
  drawLeg(4, t, true);
  drawLeg(5, t, true);
  drawLeg(legs.length - 1);
  c.restore();
}

/** Flying YAML tokens → page (mono → Geist, arcing). */
function flights(c: CanvasRenderingContext2D, t: number) {
  const items: { t0: number; line: number; before: string; str: string; to: [number, number]; fs0: number; fs1: number; font: 'ui' | 'mono'; w: number; col: string }[] = [
    { t0: tFly[0], line: 9, before: '      summary: ', str: 'Create a planet', to: usePlates() ? PL.title : [TITLE.x, TITLE.y], fs0: Y.fs, fs1: usePlates() ? 30 : TITLE.fs, font: 'ui', w: 600, col: FD.fg },
    { t0: tFly[1], line: 7, before: '    ', str: 'post', to: usePlates() ? PL.method : [EB.x + 18, EB.y + EB.h / 2 + 6], fs0: Y.fs, fs1: usePlates() ? 12 : 17, font: 'mono', w: 500, col: METHOD.POST },
    { t0: tFly[2], line: 6, before: '  ', str: '/planets', to: usePlates() ? PL.path : [EB.x + 80, EB.y + EB.h / 2 + 6], fs0: Y.fs, fs1: usePlates() ? 14 : 17, font: 'mono', w: 400, col: FD.fg },
    { t0: tFly[3], line: 17, before: "        '", str: '201', to: usePlates() ? PL.s201 : [RC.x + 16, P.y + 410], fs0: Y.fs, fs1: 14, font: 'ui', w: 500, col: FD.fg },
  ];
  for (const it of items) {
    const p = clamp((t - it.t0) / 0.16);
    if (p <= 0 || p >= 1) continue;
    const e = ease.inOutCubic(p);
    const [x0, y0] = tokenPos(c, it.line, it.before);
    const [x1, y1] = it.to;
    // arc upward
    const x = lerp(x0, x1, e);
    const y = lerp(y0, y1, e) - Math.sin(Math.PI * e) * 90;
    const fs = lerp(it.fs0, it.fs1, e);
    const font = e < 0.5 ? 'code' : it.font;
    // trail
    c.strokeStyle = hexA(A, 0.6 * (1 - p));
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x0, y0 - 6);
    c.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 140, x, y - 6);
    c.stroke();
    // token chip
    const tw = measure(c, it.str, { font, size: fs, weight: it.w });
    rr(c, x - 6, y - fs * 0.95, tw + 12, fs * 1.35, 5);
    c.fillStyle = '#0A0A0B';
    c.fill();
    c.strokeStyle = hexA(K, 0.9);
    c.stroke();
    text(c, it.str, x, y, { font, size: fs, weight: it.w, color: e < 0.5 ? K : it.col === FD.fg ? FD.fg : it.col });
  }
}

/** P1PE annotation: brackets + labels around the active parts. */
function annotations(c: CanvasRenderingContext2D, t: number, s: number) {
  const lw = 1 / s;
  // spec
  const ya = seg(t, 76.9, 77.2, ease.outCubic);
  if (ya > 0) {
    c.save();
    c.globalAlpha *= ya;
    brackets(c, Y.x - 10, Y.y - 10, Y.w + 20, Y_H + 20, 16, 2.2 * lw, A);
    text(c, 'SPEC', Y.x - 10, Y.y - 26, { font: 'wide', size: 13, tracking: 0.3, color: A });
    text(c, 'openapi 3.1.1 · 19 lines', Y.x + Y.w + 10, Y.y - 26, { font: 'mono', size: 12, align: 'right', color: hexA(A, 0.75) });
    const pc = clamp((t - tScan0) / (tScan1 - tScan0));
    if (t > tScan0 - 0.05) pctTag(c, Y.x + Y.w - 108, Y.y + Y_H + 28, hold(pc * 100, 30), { color: K, bg: A, size: 12 });
    c.restore();
  }
  // page
  const pa = seg(t, 77.0, 77.3, ease.outCubic);
  if (pa > 0) {
    c.save();
    c.globalAlpha *= pa;
    text(c, 'API REFERENCE', P.x, P.y - 18, { font: 'wide', size: 13, tracking: 0.3, color: A });
    text(c, '/docs/planets/create-planet', P.x + 232, P.y - 18, { font: 'mono', size: 12, color: hexA(A, 0.75) });
    c.restore();
  }
  // frame draw-on during the boot
  const fp = seg(t, 76.86, 77.16, ease.outCubic);
  if (fp < 1) {
    c.lineWidth = lw * 1.5;
    rectP(c, Y.x, Y.y, Y.w, Y_H, fp, lw * 2, hexA(A, 0.9 * (1 - fp)));
    rectP(c, P.x, P.y, P.w, P.h, fp, lw * 2, hexA(A, 0.9 * (1 - fp)));
  }
}

/** Real operation page (plate) with skeleton masks lifted as the spec tokens land. */
function pageCardPlate(c: CanvasRenderingContext2D, t: number, a: number) {
  const img = plates.opPage!;
  c.save();
  c.globalAlpha *= a;
  rr(c, P.x, P.y, P.w, P.h, 16);
  c.save();
  c.clip();
  c.drawImage(img, 1000, 60, P.w * 2, P.h * 2, P.x, P.y, P.w, P.h);
  // masks (page background + skeleton) until each part is generated
  const mask = (x: number, y: number, w: number, h: number, on: number, bars: [number, number, number, number][]) => {
    if (on >= 1) return;
    c.save();
    c.globalAlpha *= 1 - on;
    c.fillStyle = FD.bg;
    c.fillRect(x, y, w, h);
    for (const [bx, by, bw, bh] of bars) skel(c, bx, by, bw, bh);
    c.restore();
  };
  const titleOn = seg(t, tFly[0] + 0.16, tFly[0] + 0.2);
  mask(opX(536), opY(86), 620, 54, titleOn, [[opX(542), opY(96), 330, 32]]);
  const methodOn = t >= tFly[1] + 0.12 ? 1 : 0;
  mask(opX(553), opY(160), 38, 24, methodOn, [[opX(557), opY(165), 30, 14]]);
  const pathOn = seg(t, tFly[2] + 0.12, tFly[2] + 0.15);
  mask(opX(594), opY(158), 80, 28, pathOn, [[opX(598), opY(165), 62, 14]]);
  const descOn = seg(t, tFly[3] + 0.1, tFly[3] + 0.22);
  mask(opX(536), opY(205), 700, 52, descOn, [[opX(542), opY(214), 520, 13], [opX(542), opY(234), 300, 13]]);
  const bodyOn = seg(t, tFly[3] + 0.08, tFly[3] + 0.26, ease.outCubic);
  if (bodyOn < 1) {
    // wipe downward: the generated sections appear top-down
    const y0 = opY(270) + (P.y + P.h - opY(270)) * bodyOn;
    c.fillStyle = FD.bg;
    c.fillRect(opX(536), y0, 712, P.y + P.h - y0);
    for (let i = 0; i < 6; i++) {
      const by = opY(296) + i * 70;
      if (by > y0) skel(c, opX(542), by, 160 + ((i * 67) % 200), 14);
    }
  }
  const rcOn = seg(t, tFly[3] + 0.06, tFly[3] + 0.24, ease.outCubic);
  if (rcOn < 1) {
    const y0 = opY(140) + 580 * rcOn;
    c.fillStyle = FD.bg;
    c.fillRect(opX(1238), y0, 420, opY(720) - y0);
    for (let i = 0; i < 5; i++) {
      const by = opY(200) + i * 40;
      if (by > y0) skel(c, opX(1262), by, 180 + ((i * 53) % 150), 12);
    }
  }
  // method flap through the real label plates: GET → PUT → DELETE → PATCH → POST
  if (methodOn && t < tFly[1] + 0.12 + 0.3) {
    const seq = ['GET', 'PUT', 'DELETE', 'PATCH', 'POST'];
    const f = Math.min(seq.length - 1, Math.floor((t - tFly[1] - 0.12) * 18));
    c.fillStyle = FD.card;
    c.fillRect(opX(553), opY(160), 42, 24);
    const lab = plates.labels[seq[f]];
    if (lab) c.drawImage(lab, opX(557) - 0.5, opY(164) - 0.5, lab.width / 4, lab.height / 4);
  }
  c.restore();
  c.lineWidth = 1;
  c.strokeStyle = FD.border;
  rr(c, P.x, P.y, P.w, P.h, 16);
  c.stroke();
  // code-sample flips on 16ths (after the playground closes), real per-tab captures
  if (t >= tFlip0) {
    const i = Math.min(6, 1 + Math.floor((t - tFlip0) / 0.1 + 1e-6));
    const im = plates.code[TABS[i]];
    if (im) {
      // the page's own (cURL-height) response card must not show below a taller panel
      c.fillStyle = FD.bg;
      c.fillRect(opX(1240), opY(149), 412, P.y + P.h - opY(149));
      c.save();
      rr(c, opX(1245), opY(149), 402, 548.6, 12);
      c.clip();
      c.drawImage(im, opX(1245), opY(149), 402, 548.6);
      const fade = c.createLinearGradient(0, opY(149 + 548.6 - 70), 0, opY(149 + 548.6));
      fade.addColorStop(0, 'rgba(18,18,18,0)');
      fade.addColorStop(1, 'rgba(18,18,18,1)');
      c.fillStyle = fade;
      c.fillRect(opX(1245), opY(149 + 548.6 - 70), 402, 70);
      c.restore();
      // tab change flash
      const fl = 1 - clamp((t - tFlip0 - (i - 1) * 0.1) / 0.08);
      if (fl > 0) {
        c.fillStyle = hexA(K, 0.12 * fl);
        c.fillRect(opX(1246), opY(150), 400, 34);
      }
    }
  }
  c.restore();
}

/** Real playground dialog (plate states), springing out of / back into "Try in Playground". */
function dialogPlate(c: CanvasRenderingContext2D, t: number, open: number) {
  if (open <= 0) return;
  const state = t < tSend - 0.12 ? '1-idle' : t < tSend ? '2-send-hover' : t < tSend + 0.06 ? '2b-send-pressed' : t < tResp ? '3-sending' : '4-response';
  const img = plates.pg[state];
  if (!img) return;
  const [bx, by] = PL.tryBtn;
  const closing = t >= tClose;
  // open: uniform pop out of the button; close: a top-down wipe (both pure 2D)
  const k = closing ? 1 : lerp(0.1, 1, ease.outBack(open, 1.1));
  const cx = closing ? DP.x + DP.w / 2 : lerp(bx, DP.x + DP.w / 2, ease.outCubic(open));
  const cy = closing ? DP.y + DP.h / 2 : lerp(by, DP.y + DP.h / 2, ease.outCubic(open));
  const wipeY = closing ? DP.y + DP.h * (1 - open) : DP.y;
  c.save();
  if (closing) {
    c.beginPath();
    c.rect(DP.x - 80, wipeY, DP.w + 160, DP.y + DP.h + 80 - wipeY);
    c.clip();
  }
  c.translate(cx, cy);
  c.scale(k, k);
  c.translate(-(DP.x + DP.w / 2), -(DP.y + DP.h / 2));
  c.globalAlpha *= closing ? 1 : clamp(open * 3);
  backlight(c, DP.x, DP.y, DP.w, DP.h, 16 * KD);
  rr(c, DP.x, DP.y, DP.w, DP.h, 16 * KD);
  c.save();
  c.clip();
  c.drawImage(img, 48, 48, 2560, 1664, DP.x, DP.y, DP.w, DP.h);
  c.restore();
  screenGlass(c, DP.x, DP.y, DP.w, DP.h, 16 * KD, 0.8);
  // send ripple + response flash
  const rp = clamp((t - tSend) / 0.3);
  if (rp > 0 && rp < 1) {
    c.strokeStyle = hexA(K, 1 - rp);
    c.lineWidth = 2;
    const sw = 117.9 * KD, sh = 40 * KD;
    rr(c, dlX(1465.1) - 14 * rp, dlY(173) - 14 * rp, sw + 28 * rp, sh + 28 * rp, 10 + 10 * rp);
    c.stroke();
  }
  const fl = 1 - seg(t, tResp, tResp + 0.14);
  if (t >= tResp && fl > 0) {
    c.fillStyle = hexA(K, 0.28 * fl);
    c.fillRect(dlX(1023), dlY(462), 559 * KD, 40 * KD);
  }
  // hero annotation on the response (b6), readable in the push-in
  const ra = seg(t, tResp, tResp + 0.08) * (1 - seg(t, tClose - 0.06, tClose));
  if (ra > 0) {
    const x = dlX(1023) - 8, y = dlY(462) - 6, w = 559 * KD + 16, h = 40 * KD + 12;
    c.save();
    c.globalAlpha *= ra;
    brackets(c, x, y, w, h, 10, 1.5, K);
    text(c, 'HTTP/1.1 201 Created', x + w, y + h + 18, { font: 'mono', size: 12, align: 'right', color: K });
    c.restore();
  }
  c.restore();
  if (closing && open > 0 && open < 1) {
    c.save();
    c.fillStyle = K;
    c.fillRect(DP.x - 6, wipeY - 2, DP.w + 12, 4);
    const g = c.createLinearGradient(0, wipeY, 0, wipeY + 40);
    g.addColorStop(0, hexA('#FFFFFF', 0.35));
    g.addColorStop(1, hexA('#FFFFFF', 0));
    c.fillStyle = g;
    c.fillRect(DP.x, wipeY, DP.w, 40);
    c.restore();
  }
}

function drawAll(c: CanvasRenderingContext2D, x: StationCtx) {
  const t = x.t;
  // dormant → booting
  const boot = seg(t, 76.84, 77.12, ease.outCubic);
  if (boot <= 0) {
    // faint wireframes before the drop
    c.save();
    c.lineWidth = 1 / x.s;
    c.strokeStyle = hexA(K, 0.16);
    rr(c, Y.x, Y.y, Y.w, Y_H, 14);
    c.stroke();
    rr(c, P.x, P.y, P.w, P.h, 16);
    c.stroke();
    c.restore();
    return;
  }
  const plate = usePlates();
  circuits(c, t, x.s);
  c.save();
  c.globalAlpha *= boot;
  backlight(c, P.x, P.y, P.w, P.h, 16);
  c.restore();
  if (plate) pageCardPlate(c, t, boot);
  else pageCard(c, t, boot);
  c.save();
  c.globalAlpha *= boot;
  screenGlass(c, P.x, P.y, P.w, P.h, 16);
  c.restore();
  if (t < tStamp + 0.1) yamlCard(c, t, boot);
  flights(c, t);
  // dim the page under the dialog (the plate dialog closes back into the page at tClose)
  const open = plate ? seg(t, tTry, tTry + 0.16) * (1 - seg(t, tClose, tClose + 0.1, ease.inOutCubic)) : seg(t, tTry, tTry + 0.16);
  if (open > 0) {
    c.fillStyle = `rgba(0,0,0,${0.5 * open})`;
    rr(c, P.x, P.y, P.w, P.h, 16);
    c.fill();
  }
  if (plate) dialogPlate(c, t, open);
  else dialog(c, t, open);
  stamp(c, t);
  server(c, t, x.s);
  annotations(c, t, x.s);
  // click bursts
  for (const tc of [tTry, tSend]) {
    const p = clamp((t - tc) / 0.22);
    if (p <= 0 || p >= 1) continue;
    const [px, py] = usePlates() ? (tc === tTry ? PL.tryBtn : PL.send) : tc === tTry ? [EB.x + EB.w - 110, EB.y + EB.h / 2] : [sendRect.x + sendRect.w / 2, sendRect.y + sendRect.h / 2];
    c.strokeStyle = hexA(ORANGE, 1 - p);
    c.lineWidth = 2 / x.s;
    c.beginPath();
    c.arc(px, py, 8 + 46 * ease.outCubic(p), 0, TAU);
    c.stroke();
  }
}

export const openapi: StationImpl = {
  get route() {
    return activeRoute();
  },
  xe,
  xx,
  tIn,
  tOut,
  get out() {
    return usePlates() ? { x: P.x, y: P.y, w: P.w, h: P.h } : { x: D.x, y: D.y, w: D.w, h: D.h };
  },
  front: drawAll,
  drawOutput(c, x) {
    if (usePlates()) pageCardPlate(c, Math.max(x.t, tFlip0 + 0.65), 1);
    else dialog(c, x.t, 1);
  },
};
