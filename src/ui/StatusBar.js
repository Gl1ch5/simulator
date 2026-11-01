import { h } from './dom.js';
import { bus } from '../core/EventBus.js';

export class StatusBar {
  constructor(ui) {
    this.hint = h('div', { class: 'hint' });
    this.coords = h('div', { class: 'coords' }, '—');
    this.el = h('div', { class: 'status panel' }, this.hint, this.coords);
    bus.on('hint', (t) => { this.hint.innerHTML = t; });
    bus.on('cursor', (s) => {
      const p = s.point;
      const kind = { vertex: 'вершина', surface: 'грань', plane: 'сетка', line: 'ось', axis: `ось ${s.axis}` }[s.kind];
      this.coords.textContent = `${kind}  x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}`;
    });
  }
}
