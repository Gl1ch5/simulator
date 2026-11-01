// Simulation heads-up display.
import { h, clear } from './dom.js';
import { ICONS } from './icons.js';
import { bus } from '../core/EventBus.js';

const ARC = (r, a0, a1) => {
  const p = (a) => [120 + Math.cos(a) * r, 120 + Math.sin(a) * r];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};
const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div', { class: 'hud hidden' });
    // speedometer
    this.speedArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 240 240');
    svg.innerHTML = `<defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#39d0ff"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs>
      <circle cx="120" cy="120" r="112" fill="rgba(10,15,22,.72)" stroke="rgba(140,200,255,.15)"/>
      <path d="${ARC(96, A0, A1)}" stroke="rgba(255,255,255,.08)" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i <= 12; i++) {
      const a = A0 + (A1 - A0) * (i / 12);
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', 120 + Math.cos(a) * 80); l.setAttribute('y1', 120 + Math.sin(a) * 80);
      l.setAttribute('x2', 120 + Math.cos(a) * 86); l.setAttribute('y2', 120 + Math.sin(a) * 86);
      l.setAttribute('stroke', 'rgba(200,220,240,.4)'); l.setAttribute('stroke-width', '2');
      svg.append(l);
    }
    this.speedArc.setAttribute('stroke', 'url(#sg)');
    this.speedArc.setAttribute('stroke-width', '10');
    this.speedArc.setAttribute('fill', 'none');
    this.speedArc.setAttribute('stroke-linecap', 'round');
    svg.append(this.speedArc);
    this.speedNum = h('div', { class: 'num' }, '0');
    this.gear = h('div', { class: 'gear' });
    this.el.append(h('div', { class: 'speedo' }, svg, this.speedNum, h('div', { class: 'unit' }, 'КМ/Ч'), this.gear));

    // inputs + keys
    this.thr = h('div'); this.brk = h('div'); this.steerDot = h('div');
    this.keys = h('div', { class: 'keys' },
      h('span', { class: 'kbd' }, 'W / S'), h('span', {}, 'газ / назад'),
      h('span', { class: 'kbd' }, 'A / D'), h('span', {}, 'руль'),
      h('span', { class: 'kbd' }, 'Пробел'), h('span', {}, 'тормоз'),
      h('span', { class: 'kbd' }, 'C'), h('span', {}, 'камера: свободная / погоня'),
      h('span', { class: 'kbd' }, 'R'), h('span', {}, 'перезапуск испытания'),
      h('span', { class: 'kbd' }, 'Esc'), h('span', {}, 'в мастерскую'),
      h('span', { class: 'kbd' }, 'ПКМ'), h('span', {}, 'вращать камеру'));
    this.el.append(h('div', { class: 'inputs panel' },
      h('div', { class: 'lbl' }, h('span', {}, 'Газ'), h('span', {}, '')), h('div', { class: 'bar' }, this.thr),
      h('div', { class: 'lbl' }, h('span', {}, 'Тормоз'), h('span', {}, '')), h('div', { class: 'bar red' }, this.brk),
      h('div', { class: 'lbl' }, h('span', {}, 'Руль'), h('span', {}, '')), h('div', { class: 'steerbar' }, this.steerDot),
      this.keys));

    this.units = h('div', { class: 'units' });
    this.el.append(this.units);
    this.warn = h('div', { class: 'hud-warn' });
    this.el.append(this.warn);
    this.top = h('div', { class: 'hud-top panel' });
    this.el.append(this.top);

    bus.on('sim:started', (asm) => this.onStart(asm));
    bus.on('sim:stopped', () => this.el.classList.add('hidden'));
    bus.on('sim:tick', (d) => this.update(d));
    bus.on('hud:toggleHelp', () => this.keys.classList.toggle('hidden'));
  }

  onStart(asm) {
    this.el.classList.remove('hidden');
    clear(this.warn);
    for (const w of asm.warnings.slice(0, 5)) this.warn.append(h('div', { class: 'warning panel', html: ICONS.warn + `<span>${w}</span>` }));
    setTimeout(() => clear(this.warn), 9000);
    clear(this.units);
    this.unitEls = new Map();
    for (const u of asm.powerUnits.values()) {
      const bar = h('div'), rpm = h('span'), tq = h('span'), pw = h('span'), gear = h('span');
      const card = h('div', { class: 'unit-card panel' },
        h('div', { class: 't' }, h('span', {}, `${u.spec.name} #${u.part.id}`), gear),
        h('div', { class: 'bar' }, bar),
        h('div', { class: 'row' }, rpm, tq, pw));
      this.units.append(card);
      this.unitEls.set(u.part.id, { bar, rpm, tq, pw, gear });
    }
  }

  update(d) {
    const sp = Math.abs(d.speed);
    this.speedNum.textContent = Math.round(sp);
    const f = Math.min(sp / 120, 1);
    this.speedArc.setAttribute('d', f > 0.003 ? ARC(96, A0, A0 + (A1 - A0) * f) : '');
    this.thr.style.width = `${Math.abs(d.throttle) * 100}%`;
    this.brk.style.width = `${d.brake * 100}%`;
    this.steerDot.style.left = `${50 - d.steer * 50}%`;
    const eng = d.units.find((u) => u.engine);
    this.gear.textContent = eng ? eng.gear : (d.speed < -0.5 ? 'R' : 'D');
    for (const u of d.units) {
      const e = this.unitEls?.get(u.id);
      if (!e) continue;
      e.bar.style.width = `${Math.min(Math.abs(u.rpm) / u.maxRpm, 1) * 100}%`;
      e.rpm.textContent = `${Math.round(Math.abs(u.rpm))} об/мин`;
      e.tq.textContent = `${u.torque.toFixed(0)} Н·м`;
      e.pw.textContent = `${(u.power / 1000).toFixed(1)} кВт`;
      e.gear.textContent = u.gear ? `передача ${u.gear}` : '';
    }
    this.top.textContent = `масса ${d.mass.toFixed(0)} кг   ·   высота ${d.height.toFixed(2)} м   ·   t ${d.time.toFixed(1)} с`;
  }
}
