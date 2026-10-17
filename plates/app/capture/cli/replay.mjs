// Replay a recorded pty session through @xterm/headless and snapshot the screen at every mark.
// node replay.mjs <session.jsonl> <cols> <rows> -> prints JSON {frames:[{label,t,lines:[{text,spans}]}], timeline}
import fs from 'node:fs';
import xterm from '@xterm/headless';

const { Terminal } = xterm;
const [, , file, cols = '100', rows = '34', every = '0'] = process.argv;
const events = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const term = new Terminal({ cols: +cols, rows: +rows, allowProposedApi: true, scrollback: 1000 });

const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'];
function color(cell, fg) {
  const isDefault = fg ? cell.isFgDefault() : cell.isBgDefault();
  if (isDefault) return null;
  const v = fg ? cell.getFgColor() : cell.getBgColor();
  if (fg ? cell.isFgRGB() : cell.isBgRGB()) return '#' + v.toString(16).padStart(6, '0');
  if (fg ? cell.isFgPalette() : cell.isBgPalette()) return v < 16 ? NAMES[v] : `ansi${v}`;
  return null;
}

function snapshot() {
  const buf = term.buffer.active;
  const lines = [];
  const cell = buf.getNullCell();
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    if (!line) continue;
    const spans = [];
    let cur = null;
    for (let x = 0; x < line.length; x++) {
      line.getCell(x, cell);
      const ch = cell.getChars() || ' ';
      if (cell.getWidth() === 0) continue;
      const style = {
        fg: color(cell, true),
        bg: color(cell, false),
        bold: !!cell.isBold() || undefined,
        dim: !!cell.isDim() || undefined,
        italic: !!cell.isItalic() || undefined,
        underline: !!cell.isUnderline() || undefined,
        inverse: !!cell.isInverse() || undefined,
        strike: !!cell.isStrikethrough() || undefined,
      };
      const key = JSON.stringify(style);
      if (cur && cur.key === key) cur.text += ch;
      else {
        cur = { key, text: ch, style };
        spans.push(cur);
      }
    }
    const text = spans.map((s) => s.text).join('').replace(/\s+$/, '');
    // trim trailing default-style spaces
    while (spans.length && spans.at(-1).style.fg === null && spans.at(-1).style.bg === null && !spans.at(-1).text.trim()) spans.pop();
    if (spans.length) spans[spans.length - 1].text = spans.at(-1).text.replace(/\s+$/, '');
    lines.push({ text, spans: spans.filter((s) => s.text.length).map((s) => ({ text: s.text, ...Object.fromEntries(Object.entries(s.style).filter(([, v]) => v !== null && v !== undefined)) })) });
  }
  while (lines.length && !lines.at(-1).text) lines.pop();
  return { cursor: [buf.cursorX, buf.cursorY - buf.viewportY], baseY: buf.baseY, lines };
}

const frames = [];
const timeline = [];
let lastAuto = 0;
let lastText = '';
const textOf = (snap) => snap.lines.map((l) => l.text).join('\n');
for (const e of events) {
  if (e.type === 'out') {
    await new Promise((r) => term.write(e.data, r));
    if (+every > 0 && e.t - lastAuto >= +every) {
      const snap = snapshot();
      const text = textOf(snap);
      if (text !== lastText) {
        frames.push({ label: 'progress', auto: true, t: e.t, ...snap });
        lastText = text;
      }
      lastAuto = e.t;
    }
  }
  else if (e.type === 'in') timeline.push({ t: e.t, key: e.data });
  else if (e.type === 'mark') {
    const snap = snapshot();
    lastText = textOf(snap);
    frames.push({ label: e.data, t: e.t, ...snap });
    timeline.push({ t: e.t, mark: e.data });
  }
}
process.stdout.write(JSON.stringify({ cols: +cols, rows: +rows, frames, timeline }));
