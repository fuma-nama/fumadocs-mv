import * as THREE from 'three';
import { boundsOf } from '../../src/engine/explore';
import { FPS, gridPos } from '../../src/engine/time';
import { lyricState } from '../../src/overlay/state';
import { registry } from '../../src/scenes';
import { app, type Selection } from './app';
import { CHAPTERS, count, el, FEATURES, LYRIC_FACES, p2, put, timecode } from './film';

const none = el('s-none');
const info = el('s-info');
const swatch = el('s-swatch');
const link = el<HTMLAnchorElement>('f-link');
const jp = el('l-jp');
const all = new THREE.Box3();
const part = new THREE.Box3();
const v = new THREE.Vector3();
const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));
const xyz = (b: THREE.Vector3) => `${num(b.x)}  ${num(b.y)}  ${num(b.z)}`;

let shown: Selection | null = null;

function selection() {
  const s = app.selection;
  if (s !== shown) {
    shown = s;
    none.hidden = !!s;
    info.hidden = !s;
    if (!s) return;
    const ob = s.objects[0] as THREE.InstancedMesh;
    const g = ob.geometry;
    const m = Array.isArray(ob.material) ? ob.material[0] : ob.material;
    const color = (m as THREE.MeshBasicMaterial | undefined)?.color;
    let tris = 0;
    for (const o of s.objects as THREE.InstancedMesh[]) if (o.isMesh) tris += (((o.geometry.index ?? o.geometry.attributes.position)?.count ?? 0) / 3) * (o.isInstancedMesh && s.instance === undefined ? o.count : 1);
    put(el('s-type'), s.objects.length > 1 ? `${ob.type} ×${s.objects.length}` : s.instance === undefined ? ob.type : `${ob.type} #${s.instance}`);
    put(el('s-name'), ob.name || '-');
    put(el('s-geo'), `${g.type} · ${count(g.attributes.position?.count ?? 0)} verts`);
    put(el('s-tris'), ob.isMesh ? count(tris) : '-');
    put(el('s-mat'), `${m?.type ?? '-'}${color ? ` #${color.getHexString()}` : ''}`);
    swatch.hidden = !color;
    if (color) swatch.style.background = `#${color.getHexString()}`;
  }
  if (!s) return;
  // objects move: their bounds follow the frame
  all.makeEmpty();
  for (let i = 0; i < s.objects.length && i < 500; i++) if (boundsOf(s.objects[i], s.instance, part)) all.union(part);
  put(el('s-pos'), all.isEmpty() ? '-' : xyz(all.getCenter(v)));
  put(el('s-size'), all.isEmpty() ? '-' : xyz(all.getSize(v)));
}

/** At the panels' rate, about 12 Hz while playing. */
export function update(f: number, cost: { ms: number; calls: number; triangles: number; lines: number }, textures: number, programs: number) {
  const t = f / FPS;
  selection();
  const k = Math.max(0, registry.findLastIndex((s) => t >= s.start));
  const g = gridPos(t);
  put(el('f-time'), timecode(f));
  put(el('f-frame'), String(f));
  put(el('f-bar'), `${p2(g.bar)} · ${g.beat}`);
  put(el('f-scene'), `${p2(k)}  ${CHAPTERS[registry[k].id]}`);
  const [, title, path, about] = FEATURES.findLast(([s]) => t >= s)!;
  put(link, title);
  if (link.dataset.path !== path) link.href = `https://fumadocs.dev${(link.dataset.path = path)}`;
  put(el('f-about'), about);

  const L = lyricState(t);
  // in the face the film sets the line in; the chant shows its reading, as the film does
  const chant = L?.style === 'chant';
  const text = L ? (chant ? L.kana : L.text) : '-';
  const font = (L && LYRIC_FACES[L.style]) ?? '';
  if (jp.dataset.font !== font) jp.style.font = jp.dataset.font = font;
  // sung so far: as many of the line's characters (spaces aside) as have started
  let sung = 0;
  let i = 0;
  if (L) for (const c of chant ? L.morae : L.chars) if (c.t <= t) sung += 'kana' in c ? c.kana.length : 1;
  for (; i < text.length && sung > 0; i++) if (text[i] !== ' ') sung--;
  put(jp.firstChild!, text.slice(0, i));
  put(jp.lastChild!, text.slice(i));
  put(el('l-en'), L?.english ?? '');

  put(el('r-ms'), `${cost.ms.toFixed(1)} ms`);
  put(el('r-draws'), String(cost.calls));
  put(el('r-tris'), cost.lines ? `${count(cost.triangles)} · ${count(cost.lines)} lines` : count(cost.triangles));
  put(el('r-tex'), String(textures));
  put(el('r-prog'), String(programs));
}
