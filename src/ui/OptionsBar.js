// Context-sensitive tool parameters (material, grid, plane, sizes...).
import { h, clear } from './dom.js';
import { bus } from '../core/EventBus.js';
import { MATERIALS, MATERIAL_ORDER } from '../model/materials.js';
import { PROFILES } from '../parts/Beam.js';
import { MOTOR_VARIANTS, ENGINE_VARIANTS } from '../parts/Power.js';
import { CONFIG } from '../core/config.js';
import { PLANES } from '../build/WorkPlane.js';

const MATERIAL_TOOLS = ['beam', 'rect', 'polygon', 'circle', 'paint', 'gear'];
const PLANE_TOOLS = ['beam', 'rect', 'polygon', 'circle'];

export class OptionsBar {
  constructor(ui) {
    this.ui = ui;
    this.build = ui.app.build;
    this.el = h('div', { class: 'options panel' });
    bus.on('tool:changed', () => this.render());
    bus.on('settings:changed', () => this.render());
    bus.on('plane:changed', () => this.renderPlaneInfo());
    this.render();
  }

  num(key, label, min, max, step, unit = '') {
    const s = this.build.settings;
    return h('div', { class: 'opt' }, h('label', {}, label),
      h('input', { type: 'number', min, max, step, value: s[key], onchange: (e) => this.build.setSetting(key, Math.min(max, Math.max(min, parseFloat(e.target.value) || min))) }),
      unit ? h('span', { class: 'unit' }, unit) : null);
  }
  select(key, label, options) {
    const s = this.build.settings;
    const sel = h('select', { onchange: (e) => this.build.setSetting(key, e.target.value) },
      ...Object.entries(options).map(([k, v]) => h('option', { value: k, selected: s[key] === k }, v)));
    return h('div', { class: 'opt' }, h('label', {}, label), sel);
  }
  toggle(key, label) {
    const s = this.build.settings;
    return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: s[key], onchange: (e) => this.build.setSetting(key, e.target.checked) }), h('span', { class: 'sw' }), label);
  }

  render() {
    const b = this.build, s = b.settings, tool = b.toolId;
    clear(this.el);
    if (MATERIAL_TOOLS.includes(tool)) {
      const chips = h('div', { class: 'chips' }, ...MATERIAL_ORDER.map((k) => {
        const m = MATERIALS[k];
        return h('button', { class: 'chip' + (s.material === k ? ' active' : ''), title: `${m.name}: ${m.density} кг/м³, трение ${m.friction}`, onclick: () => b.setSetting('material', k) },
          h('span', { class: 'swatch', style: { background: '#' + m.color.toString(16).padStart(6, '0') } }), m.name);
      }));
      this.el.append(h('div', { class: 'opt' }, chips));
    }
    if (PLANE_TOOLS.includes(tool) || tool === 'select') {
      this.el.append(this.planeControls());
    }
    switch (tool) {
      case 'beam':
        this.el.append(this.select('beamProfile', 'Профиль', PROFILES), this.num('beamSize', 'Сечение', 0.01, 0.3, 0.005, 'м'));
        break;
      case 'rect': case 'polygon':
        this.el.append(this.num('plateThickness', 'Толщина', 0.001, 1, 0.001, 'м'), this.num('round', 'Скругление', 0, 2, 0.01, 'м'));
        break;
      case 'circle':
        this.el.append(this.num('plateThickness', 'Толщина', 0.001, 1, 0.001, 'м'), this.num('circleSegments', 'Сторон', 3, 64, 1));
        break;
      case 'gear':
        this.el.append(this.num('gearTeeth', 'Зубьев', 6, 120, 1), this.num('gearModule', 'Модуль', 0.002, 0.02, 0.001, 'м'));
        break;
      case 'motor':
        this.el.append(this.select('motorVariant', 'Модель', Object.fromEntries(Object.entries(MOTOR_VARIANTS).map(([k, v]) => [k, `${v.name} · ${v.stallTorque} Н·м`]))));
        break;
      case 'engine':
        this.el.append(this.select('engineVariant', 'Модель', Object.fromEntries(Object.entries(ENGINE_VARIANTS).map(([k, v]) => [k, `${v.name} · ${v.peakTorque} Н·м`]))));
        break;
      default: break;
    }
    if (!['select', 'paint', 'delete', 'wire', 'connect'].includes(tool)) this.el.append(this.toggle('autoConnect', 'Автосоединение'));
    if (tool === 'select' || tool === 'connect') this.el.append(this.toggle('showConnections', 'Показывать соединения'));
    if (!this.el.children.length) this.el.append(h('span', { class: 'muted' }, this.build.tool.name));
  }

  planeControls() {
    const wp = this.build.workPlane;
    const wrap = h('div', { class: 'opt' });
    wrap.append(h('label', {}, 'Сетка'));
    wrap.append(h('select', { onchange: (e) => { wp.setStep(parseFloat(e.target.value)); this.ui.app.gizmo.setTranslationSnap(wp.step); } },
      ...CONFIG.gridSizes.map((g) => h('option', { value: g, selected: Math.abs(wp.step - g) < 1e-9 }, g >= 1 ? `${g} м` : `${Math.round(g * 1000)} мм`))));
    const modes = [['auto', 'АВТО', 'Срез выбирается по взгляду камеры — клавиша 0'], ...Object.entries(PLANES).map(([k, v], i) => [k, k, `${v.label} — клавиша ${i + 1}`])];
    const chips = h('div', { class: 'chips' }, ...modes.map(([k, lbl, title]) =>
      h('button', { class: 'chip', 'data-mode': k, title, onclick: () => { wp.setMode(k); this.renderPlaneInfo(); } }, lbl)));
    wrap.append(h('label', { style: { marginLeft: '6px' } }, 'Срез'), chips);
    this.planeInfo = h('span', { class: 'kbd', title: 'Q / E или Shift+колесо — сдвинуть срез сквозь решётку' });
    wrap.append(this.planeInfo);
    this.renderPlaneInfo();
    return wrap;
  }
  renderPlaneInfo() {
    if (!this.planeInfo) return;
    const wp = this.build.workPlane;
    const axis = PLANES[wp.orientation].axis;
    this.planeInfo.textContent = `${wp.orientation} · ${axis}=${wp.offset.toFixed(2)}`;
    for (const c of this.el.querySelectorAll('.chips .chip[data-mode]')) c.classList.toggle('active', c.dataset.mode === wp.mode);
  }
}
