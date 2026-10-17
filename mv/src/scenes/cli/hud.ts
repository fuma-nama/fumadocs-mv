import { FONTS, pctTag } from '../../engine/draw2d';
import { clamp, ease, seg } from '../../engine/anim';
import { P } from './pal';
import { T, FLOPPIES } from './timeline';
import { installedCount, FILE_COUNT } from './term';

export interface Callout {
  id: string;
  n: string;
  label: string;
  sub: string;
  /** label offset from the anchor (px): blueprint (front elevation) and live (3/4 view) */
  bp: [number, number];
  live: [number, number];
}

export const CALLOUTS: Callout[] = [
  { id: 'bay', n: '01', label: 'CARTRIDGE BAY', sub: '8 SLOTS · layouts/docs', bp: [-140, -150], live: [-330, -86] },
  { id: 'display', n: '02', label: 'FLAP DISPLAY', sub: 'IMPORT PATH', bp: [-260, -150], live: [-300, -60] },
  { id: 'core', n: '03', label: 'CORE', sub: 'MOON · FD-16', bp: [200, 300], live: [150, 250] },
  { id: 'print', n: '04', label: 'PRINT HEAD', sub: '→ PAGE', bp: [-300, 170], live: [380, 130] },
  { id: 'gear', n: '05', label: 'GEAR TRAIN', sub: '16T / 9T', bp: [-250, 30], live: [-250, -200] },
];

/** Blueprint-only drawing details the edge pass can't see: flap cells, nameplate, dimensions. */
export function drawBlueprintDetails(c: CanvasRenderingContext2D, a: Record<string, { x: number; y: number }>, alpha: number) {
  if (alpha <= 0 || !a.dispTL) return;
  c.save();
  c.globalAlpha *= alpha;
  const ink = P.OCEAN;
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = 1;
  // split-flap cells 30 × 2
  const x0 = a.dispTL.x;
  const y0 = a.dispTL.y;
  const x1 = a.dispBR.x;
  const y1 = a.dispBR.y;
  c.globalAlpha *= 0.55;
  c.beginPath();
  for (let i = 1; i < 30; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / 30) + 0.5;
    c.moveTo(x, y0 + 4);
    c.lineTo(x, y1 - 4);
  }
  const ym = Math.round((y0 + y1) / 2) + 0.5;
  c.moveTo(x0, ym);
  c.lineTo(x1, ym);
  c.stroke();
  c.globalAlpha /= 0.55;
  // nameplate lettering
  c.font = `400 14px ${FONTS.wide}`;
  c.letterSpacing = '4px';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('DOCUMENT ENGINE · FD-16', a.nameL.x + 6, a.nameL.y);
  c.letterSpacing = '0px';
  // overall width dimension under the plinth
  const dy = Math.round(a.plinthL.y + 46) + 0.5;
  c.beginPath();
  c.moveTo(a.plinthL.x, a.plinthL.y + 8);
  c.lineTo(a.plinthL.x, dy + 8);
  c.moveTo(a.plinthR.x, a.plinthR.y + 8);
  c.lineTo(a.plinthR.x, dy + 8);
  c.moveTo(a.plinthL.x, dy);
  c.lineTo(a.plinthR.x, dy);
  c.stroke();
  for (const [x, d] of [[a.plinthL.x, 1], [a.plinthR.x, -1]] as const) {
    c.beginPath();
    c.moveTo(x, dy);
    c.lineTo(x + 9 * d, dy - 4);
    c.lineTo(x + 9 * d, dy + 4);
    c.closePath();
    c.fill();
  }
  c.font = `400 13px ${FONTS.mono}`;
  c.textAlign = 'center';
  c.fillStyle = P.DESK;
  const label = 'W 8500 · layouts/docs';
  const lw = c.measureText(label).width + 16;
  const mx = (a.plinthL.x + a.plinthR.x) / 2;
  c.fillRect(mx - lw / 2, dy - 9, lw, 18);
  c.fillStyle = ink;
  c.fillText(label, mx, dy + 1);
  // core centre mark
  const cc = a.coreC;
  c.beginPath();
  c.moveTo(cc.x - 14, cc.y + 0.5);
  c.lineTo(cc.x + 14, cc.y + 0.5);
  c.moveTo(cc.x + 0.5, cc.y - 14);
  c.lineTo(cc.x + 0.5, cc.y + 14);
  c.stroke();
  c.restore();
}

/**
 * P1PE-style part callouts: elbow leader lines from projected anchors to boxed labels.
 * `ink` is OCEAN in the blueprint, INK on the live machine.
 */
export function drawCallouts(c: CanvasRenderingContext2D, t: number, anchors: Record<string, { x: number; y: number }>, o: { ink: string; alpha: number; live: boolean }) {
  if (o.alpha <= 0) return;
  c.save();
  c.globalAlpha *= o.alpha;
  CALLOUTS.forEach((co, i) => {
    const a = anchors[co.id];
    if (!a) return;
    // live: callouts draw on one by one after the reveal
    const k = o.live ? ease.outCubic(seg(t, T.enter3 + 0.45 + i * 0.1, T.enter3 + 0.65 + i * 0.1)) : 1;
    if (k <= 0) return;
    // anchors off screen (camera pushed in) drop their callout
    if (a.x < 8 || a.x > 1912 || a.y < 8 || a.y > 1030) return;
    const [dx, dy] = o.live ? co.live : co.bp;
    const left = dx < 0;
    c.font = `400 16px ${FONTS.pixel}`;
    const text = `${co.n} ${co.label}`;
    const tw = Math.ceil(c.measureText(text).width) + 14;
    // the label box stays inside the frame (and above the taskbar); the leader bends to meet it
    let bx = Math.round(left ? a.x + dx - tw : a.x + dx);
    bx = Math.max(28, Math.min(1892 - tw - (co.id === 'bay' ? 110 : 0), bx));
    const by = Math.round(Math.max(44, Math.min(980, a.y + dy - 11)));
    const ey = by + 11;
    const lx = left ? bx + tw : bx;
    const ex = a.x + (lx - a.x) * 0.35;
    c.strokeStyle = o.ink;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(a.x, a.y);
    const p1 = clamp(k * 2);
    c.lineTo(a.x + (ex - a.x) * p1, a.y + (ey - a.y) * p1);
    if (k > 0.5) c.lineTo(ex + (lx - ex) * clamp(k * 2 - 1), ey);
    c.stroke();
    c.fillStyle = o.ink;
    c.fillRect(Math.round(a.x) - 2, Math.round(a.y) - 2, 4, 4);
    if (k < 0.9) return;
    c.fillStyle = o.live ? P.INK : P.DESK;
    c.fillRect(bx, by, tw, 22);
    c.strokeStyle = o.ink;
    c.strokeRect(bx + 0.5, by + 0.5, tw - 1, 21);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.letterSpacing = '0px';
    c.fillStyle = o.live ? P.ORANGE : o.ink;
    c.fillText(co.n, bx + 7, by + 11);
    c.fillStyle = o.live ? P.WHITE : o.ink;
    c.fillText(co.label, bx + 7 + Math.round(c.measureText(co.n + ' ').width), by + 11);
    c.font = `400 12px ${FONTS.mono}`;
    c.fillStyle = o.ink;
    const sub = co.id === 'bay' && o.live ? `FILES ${String(installedCount(t)).padStart(2, '0')}/${FILE_COUNT} · SLOTS ${FLOPPIES.filter((f) => t >= f.land).length}/8` : co.sub;
    c.fillText(sub, bx + 2, by + 34);
    if (co.id === 'bay' && o.live && t < T.flapFrom) pctTag(c, bx + tw + 8, by + 11, (installedCount(t) / FILE_COUNT) * 100, { color: P.INK, bg: P.WHITE, size: 13 });
  });
  c.restore();
}
