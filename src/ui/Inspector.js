// Right panel: properties of the selected part + live vehicle analysis.
import { h, clear } from './dom.js';
import { ICONS } from './icons.js';
import { bus } from '../core/EventBus.js';
import { typeOf, partName } from '../parts/registry.js';
import { MATERIALS, MATERIAL_ORDER } from '../model/materials.js';
import { CHANNELS } from '../parts/Seat.js';
import { validate } from '../model/validate.js';
import { fmt } from '../core/math.js';

const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, path, v) {
  const keys = path.split('.');
  const copy = JSON.parse(JSON.stringify(o[keys[0]] ?? null));
  if (keys.length === 1) return { [keys[0]]: v };
  let cur = copy;
  for (let i = 1; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = v;
  return { [keys[0]]: copy };
}

export class Inspector {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = h('div', { class: 'inspector panel' });
    this.partBox = h('div');
    this.statsBox = h('div');
    this.el.append(this.partBox, this.statsBox);
    this.part = null;
    bus.on('selection', (p) => { this.part = p; this.renderPart(); });
    bus.on('blueprint:changed', () => {
      if (this.part) { this.part = this.app.blueprint.get(this.part.id) || null; this.renderPart(); }
      this.scheduleValidate();
    });
    this.renderPart();
    this.scheduleValidate();
  }

  scheduleValidate() {
    clearTimeout(this.vt);
    this.vt = setTimeout(async () => { this.renderStats(await validate(this.app.blueprint)); }, 250);
  }

  apply(patch) {
    const bp = this.app.blueprint;
    bp.commit();
    bp.update(this.part.id, patch);
  }

  fieldEl(f) {
    const p = this.part;
    if (f.type === 'info') return h('div', { class: 'field' }, h('span', {}, f.label), h('span', { class: 'info' }, f.fn(p)));
    if (f.type === 'material') {
      return h('div', { class: 'field' }, h('span', {}, f.label),
        h('select', { onchange: (e) => this.apply({ material: e.target.value }) },
          ...MATERIAL_ORDER.map((k) => h('option', { value: k, selected: p.material === k }, MATERIALS[k].name))));
    }
    if (f.type === 'select') {
      return h('div', { class: 'field' }, h('span', {}, f.label),
        h('select', { onchange: (e) => this.apply(setPath(p, f.key, e.target.value)) },
          ...Object.entries(f.options).map(([k, v]) => h('option', { value: k, selected: getPath(p, f.key) === k }, v))));
    }
    if (f.type === 'check') {
      return h('div', { class: 'field' }, h('span', {}, f.label),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: !!getPath(p, f.key), onchange: (e) => this.apply(setPath(p, f.key, e.target.checked)) }), h('span', { class: 'sw' })));
    }
    const val = getPath(p, f.key);
    return h('div', { class: 'field' }, h('span', {}, f.label),
      h('div', {}, h('input', {
        type: 'number', min: f.min, max: f.max, step: f.step, value: +(+val).toFixed(4),
        onchange: (e) => {
          let v = parseFloat(e.target.value);
          if (!Number.isFinite(v)) return;
          v = Math.min(f.max, Math.max(f.min, v));
          if (f.step >= 1) v = Math.round(v);
          this.apply(this.specialPatch(f.key, v));
        },
      }), f.unit ? h('span', { class: 'unit' }, f.unit) : null));
  }

  /** Some edits need geometry updates beyond the field itself. */
  specialPatch(key, v) {
    const p = this.part;
    if (p.type === 'beam' && key === 'length') return { length: v };
    return setPath(p, key, v);
  }

  renderPart() {
    clear(this.partBox);
    const p = this.part;
    if (!p) {
      this.partBox.append(h('h3', {}, 'Инспектор'), h('div', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.5 } },
        'Выбери деталь инструментом «Выбор» (V), чтобы изменить её параметры: материал, размеры, число зубьев, мощность…'));
      return;
    }
    const T = typeOf(p);
    const bp = this.app.blueprint;
    this.partBox.append(h('h3', {}, partName(p), h('span', { class: 'idtag' }, '#' + p.id)));
    this.partBox.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, `Масса: ${fmt(T.mass(p), 2)} кг`));
    this.partBox.append(h('h4', {}, 'Параметры'));
    for (const f of T.fields(p)) this.partBox.append(this.fieldEl(f));

    if (p.base != null || p.moving != null || p.mount != null) {
      this.partBox.append(h('h4', {}, 'Крепление'));
      const nm = (id) => { const q = bp.get(id); return q ? `${partName(q)} #${id}` : '—'; };
      if (p.base != null) this.partBox.append(h('div', { class: 'list-row' }, h('span', { class: 'muted' }, 'Основание'), h('span', {}, nm(p.base))));
      if (p.moving != null) this.partBox.append(h('div', { class: 'list-row' }, h('span', { class: 'muted' }, 'Подвижная часть'), h('span', {}, nm(p.moving))));
      if (p.mount != null) this.partBox.append(h('div', { class: 'list-row' }, h('span', { class: 'muted' }, 'Установлена на'), h('span', {}, nm(p.mount))));
    }
    const conns = bp.connectionsOf(p.id);
    if (conns.length) {
      this.partBox.append(h('h4', {}, `Жёсткие соединения (${conns.length})`));
      for (const c of conns) {
        const other = c.a === p.id ? c.b : c.a;
        const q = bp.get(other);
        this.partBox.append(h('div', { class: 'wire-row' }, h('span', { class: 'nm' }, q ? `${partName(q)} #${other}` : '#' + other),
          h('button', { class: 'chip', onclick: () => { bp.commit(); bp.disconnect(p.id, other); } }, 'разъединить')));
      }
    }
    if (p.type === 'seat') this.renderWires(p);
    this.partBox.append(h('div', { style: { display: 'flex', gap: '6px', marginTop: '14px' } },
      h('button', { class: 'btn', onclick: () => { bp.commit(); bp.remove(p.id); this.app.build.select(null); }, html: ICONS.delete + '<span>Удалить</span>' })));
  }

  renderWires(seat) {
    const bp = this.app.blueprint;
    this.partBox.append(h('h4', {}, 'Провода управления'));
    if (!seat.wires.length) this.partBox.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Нет подключений. Инструмент «Провод» (L).'));
    seat.wires.forEach((w, i) => {
      const t = bp.get(w.to);
      const update = (patch) => { const wires = seat.wires.map((x, j) => (j === i ? { ...x, ...patch } : x)); this.apply({ wires }); };
      this.partBox.append(h('div', { class: 'wire-row' },
        h('span', { class: 'nm' }, t ? `${partName(t)} #${t.id}` : '?'),
        h('select', { onchange: (e) => update({ ch: e.target.value }) }, ...Object.entries(CHANNELS).map(([k, v]) => h('option', { value: k, selected: w.ch === k }, v.split(' ')[0]))),
        h('label', { class: 'toggle', title: 'Инверсия' }, h('input', { type: 'checkbox', checked: w.invert, onchange: (e) => update({ invert: e.target.checked }) }), h('span', { class: 'sw' })),
        h('button', { class: 'chip', title: 'Отключить', onclick: () => this.apply({ wires: seat.wires.filter((_, j) => j !== i) }) }, '×')));
    });
  }

  renderStats(v) {
    clear(this.statsBox);
    const bp = this.app.blueprint;
    this.statsBox.append(h('h4', {}, 'Анализ конструкции'));
    this.statsBox.append(h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, `${fmt(v.mass, 1)}`), h('div', { class: 'k' }, 'масса, кг')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(bp.parts.size)), h('div', { class: 'k' }, 'деталей')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(v.bodies || 0)), h('div', { class: 'k' }, 'твёрдых тел')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(v.joints || 0)), h('div', { class: 'k' }, 'подвижных узлов')),
    ));
    if (v.meshes?.length) {
      this.statsBox.append(h('h4', {}, 'Зубчатые передачи'));
      for (const m of v.meshes) this.statsBox.append(h('div', { class: 'list-row' }, h('span', {}, `#${m.a} → #${m.b}`), h('span', { class: 'info' }, `i = ${fmt(m.ratio, 2)}`)));
    }
    this.statsBox.append(h('h4', {}, 'Проверка'));
    if (!bp.parts.size) this.statsBox.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Пусто. Начни с балок (B) или прямоугольника (R).'));
    else if (!v.warnings.length) this.statsBox.append(h('div', { class: 'okline' }, '✓ Всё собрано корректно — жми «Испытать»'));
    else this.statsBox.append(h('div', { class: 'warnings' }, ...v.warnings.slice(0, 12).map((w) => h('div', { class: 'warning', html: ICONS.warn + `<span>${w}</span>` }))));
  }
}
