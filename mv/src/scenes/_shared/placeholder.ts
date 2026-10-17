import type { SceneImpl } from '../../engine/engine';
import { gridPos } from '../../engine/time';
import { text, grid, boxLabel } from '../../engine/draw2d';

/** Temporary stand-in until the section's scene is built. */
export function placeholder(id: string, title: string): SceneImpl {
  return {
    render(f) {
      const L = f.e.layer(`${id}:ph`);
      const c = L.begin('#101014');
      grid(c, 0, 0, f.W, f.H, 80, 1, '#ffffff14');
      const g = gridPos(f.t);
      boxLabel(c, title.toUpperCase(), f.W / 2, f.H / 2 - 40, { size: 22, align: 'center', ticks: true });
      text(c, `bar ${g.bar}.${g.beat}   ${f.t.toFixed(2)}s   lt ${f.lt.toFixed(2)}`, f.W / 2, f.H / 2 + 40, { font: 'mono', size: 24, align: 'center', color: '#888' });
      if (f.boundary) text(c, `boundary ${f.boundary.role} owner=${f.boundary.isOwner} p=${f.boundary.p.toFixed(2)}`, f.W / 2, f.H / 2 + 90, { font: 'mono', size: 20, align: 'center', color: '#FA8023' });
      return L.end();
    },
  };
}
