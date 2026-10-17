import type * as THREE from 'three';
import { explore } from '../../src/engine/explore';
import { DURATION } from '../../src/engine/time';
import { registry } from '../../src/scenes';
import { app, type Selection } from './app';
import { CHAPTERS, clockText, count, el, FEATURES, p2 } from './film';

const film = el('film');
/** the rendered scenes behind the live rows, in the order the frame drew them */
const drawn: THREE.Scene[] = [];
/** the row that shows an object, and the row of a group selection */
const rows = new Map<THREE.Object3D | THREE.Object3D[], HTMLButtonElement>();
/** open rows, by key, kept across rebuilds */
const open = new Set<string>();
const closed = new Set<string>();
let live: HTMLUListElement | undefined;
let current = -1;
let marked: HTMLElement | undefined;

function row(list: HTMLElement, depth: number, label: string, meta: string, act?: () => void) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'row';
  b.style.setProperty('--d', String(depth));
  const name = document.createElement('span');
  const m = document.createElement('small');
  name.textContent = b.title = label;
  m.textContent = meta;
  b.append(name, m);
  if (act) b.addEventListener('click', act);
  li.append(b);
  list.append(li);
  return b;
}

/** Children that build on first open; `key` keeps the row open or closed across rebuilds. */
function nest(b: HTMLButtonElement, key: string, byDefault: boolean, fill: (ul: HTMLUListElement) => void) {
  const ul = document.createElement('ul');
  let filled = false;
  const set = (on: boolean) => {
    b.setAttribute('aria-expanded', String(on));
    ul.hidden = !on;
    if (on && !filled) fill(ul);
    filled ||= on;
    (on ? open : closed).add(key);
    (on ? closed : open).delete(key);
  };
  set(open.has(key) || (byDefault && !closed.has(key)));
  b.addEventListener('click', () => set(!!ul.hidden));
  b.parentElement!.append(ul);
}

const choose = (sel: Selection) => app.select(app.selection?.objects === sel.objects ? null : sel);

el('film-meta').textContent = `${clockText(DURATION)} · ${registry.length} scenes`;
const sceneRows = registry.map((s, k) => {
  const b = row(film, 1, `${p2(k)}  ${CHAPTERS[s.id]}`, `${clockText(s.start)}-${clockText(s.end)}`, () => app.ready && app.seek(s.start));
  const about = document.createElement('em');
  for (const [t, title] of FEATURES) if (t >= s.start && t < s.end) about.textContent += (about.textContent ? ', ' : '') + title;
  b.append(about);
  return b;
});

function group(list: HTMLElement, label: string, objects: THREE.Object3D[]) {
  const one = objects[0] as THREE.InstancedMesh;
  const g = one.geometry;
  const n = (g.index ?? g.attributes.position)?.count ?? 0;
  const meta = objects.length > 1 ? `×${objects.length}` : one.isInstancedMesh ? `${count(one.count)} inst` : one.isMesh ? `${count(n / 3)} tris` : `${count(n)} verts`;
  const sel = { objects };
  const b = row(list, 3, label, meta, () => choose(sel));
  rows.set(objects, b);
  for (const ob of objects) rows.set(ob, b);
  if (objects.length > 1)
    nest(b, `group:${label}`, false, (ul) => {
      for (let i = 0; i < objects.length && i < 60; i++) {
        const ob = objects[i];
        const one = { objects: [ob] };
        const r = row(ul, 4, ob.name || `${ob.type} #${i}`, '', () => choose(one));
        rows.set(one.objects, r).set(ob, r);
      }
      if (objects.length > 60) row(ul, 4, `+${objects.length - 60} more`, '');
    });
}

/** The current scene's live rows: each three.js scene the frame drew, its objects grouped by name or type and geometry. */
function rebuild() {
  live?.remove();
  rows.clear();
  live = document.createElement('ul');
  if (!drawn.length) row(live, 2, '2D shot', 'no 3D').disabled = true;
  const seen = explore.seen!;
  for (const scene of drawn) {
    let keys = '';
    for (let i = 0; i < explore.drawn; i++) if (seen[i].scene === scene) keys += (keys ? ' ' : '') + seen[i].key;
    const groups = new Map<string, THREE.Object3D[]>();
    let n = 0;
    scene.traverse((ob) => {
      const g = (ob as THREE.Mesh).geometry;
      if (!g) return;
      const k = ob.name || `${ob.type} · ${g.type.replace('Geometry', '')}`;
      let list = groups.get(k);
      if (!list) groups.set(k, (list = []));
      list.push(ob);
      n++;
    });
    const b = row(live, 2, keys, `${n} obj`);
    b.classList.add('pass');
    nest(b, `pass:${keys}`, true, (ul) => {
      const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
      for (let i = 0; i < sorted.length && i < 40; i++) group(ul, sorted[i][0], sorted[i][1]);
    });
  }
  sceneRows[current].parentElement!.append(live);
  mark(app.selection);
}

/** At the panels' rate: follows the scene and rebuilds the live rows when the set of drawn scenes changes. */
export function update(t: number) {
  const k = Math.max(0, registry.findLastIndex((s) => t >= s.start));
  let same = k === current;
  const seen = explore.seen!;
  let n = 0;
  for (let i = 0; i < explore.drawn; i++) {
    const scene = seen[i].scene;
    let again = false;
    for (let j = 0; j < i; j++) again ||= seen[j].scene === scene;
    if (again) continue;
    if (drawn[n] !== scene) {
      same = false;
      drawn[n] = scene;
    }
    n++;
  }
  if (n !== drawn.length) same = false;
  drawn.length = n;
  if (same) return;
  sceneRows[current]?.removeAttribute('aria-current');
  sceneRows[k].setAttribute('aria-current', 'true');
  current = k;
  rebuild();
}

/** Highlights the selection's row; `reveal` scrolls to it, for selections made in the viewport. */
export function mark(sel: Selection | null, reveal = false) {
  marked?.classList.remove('sel');
  marked = sel ? (rows.get(sel.objects) ?? rows.get(sel.objects[0])) : undefined;
  marked?.classList.add('sel');
  if (reveal) marked?.scrollIntoView({ block: 'nearest' });
}
