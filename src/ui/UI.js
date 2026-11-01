// UI root: assembles panels, toasts and modal dialogs.
import { h, clear } from './dom.js';
import { ICONS } from './icons.js';
import { bus } from '../core/EventBus.js';
import { TopBar } from './TopBar.js';
import { Toolbar } from './Toolbar.js';
import { OptionsBar } from './OptionsBar.js';
import { Inspector } from './Inspector.js';
import { StatusBar } from './StatusBar.js';
import { HUD } from './HUD.js';
import { buildBuggy } from '../examples/buggy.js';

export class UI {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.top = new TopBar(this);
    this.toolbar = new Toolbar(this);
    this.options = new OptionsBar(this);
    this.inspector = new Inspector(this);
    this.status = new StatusBar(this);
    this.hud = new HUD(this);
    this.toasts = h('div', { class: 'toasts' });
    this.buildPanels = [this.toolbar.el, this.options.el, this.inspector.el, this.status.el];
    root.append(this.top.el, ...this.buildPanels, this.hud.el, this.toasts);
    bus.on('toast', (m, k) => this.toast(m, k));
    bus.on('mode', (m) => this.buildPanels.forEach((p) => p.classList.toggle('hidden', m !== 'build')));
    bus.on('help', () => this.showHelp());
    app.build.updateHint();
  }

  toast(msg, kind = 'info') {
    const t = h('div', { class: 'toast ' + kind }, msg);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2600);
  }

  modal(content, { wide = false } = {}) {
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } });
    const box = h('div', { class: 'modal panel', style: wide ? { width: 'min(900px, calc(100% - 40px))' } : null });
    const close = () => { bg.remove(); window.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.code === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    box.append(...[].concat(content(close)));
    bg.append(box);
    this.root.append(bg);
    return close;
  }

  showWelcome(restored) {
    this.modal((close) => [
      h('h2', {}, 'Добро пожаловать в FORGE'),
      h('p', {}, 'Здесь нет готовых машин и заготовок. Только сырьё и физика: балки, пластины, круги, тяни-толкай, подшипники, шарниры, шестерни, моторы и ДВС. ',
        'Масса считается из материала и объёма, передаточное число — из размеров шестерён, реактивный момент мотора действует на раму.'),
      h('div', { class: 'cards' },
        h('div', { class: 'card', onclick: () => { if (!restored) { this.app.blueprint.clear(); } close(); this.app.build.setTool('beam'); } },
          h('div', { html: ICONS.beam }), h('div', { class: 'ct' }, restored ? 'Продолжить' : 'С чистого листа'), h('div', { class: 'cd' }, restored ? 'Вернуться к последнему проекту (автосохранение)' : 'Пустая мастерская, бесконечная 3D-сетка')),
        h('div', { class: 'card', onclick: () => { buildBuggy(this.app.blueprint); close(); this.app.build.setTool('select'); this.toast('Пример собран из тех же примитивов. Жми «Испытать» (F5)'); } },
          h('div', { html: ICONS.car }), h('div', { class: 'ct' }, 'Пример: электробагги'), h('div', { class: 'cd' }, 'Рама из труб, ось в подшипниках, шестерни 12:48, мотор 8 кВт, рулевые шарниры')),
        h('div', { class: 'card', onclick: () => { close(); this.showHelp(); } },
          h('div', { html: ICONS.help }), h('div', { class: 'ct' }, 'Как строить'), h('div', { class: 'cd' }, 'Пошагово: рама → колёса → привод → руль → провода')),
      ),
      h('div', { class: 'muted', style: { fontSize: '12px' } }, 'ПКМ — вращать камеру · колесо — зум · СКМ — панорама · стрелки — двигать камеру · F1 — справка'),
    ]);
  }

  showHelp() {
    const row = (k, v) => h('div', { class: 'row' }, h('span', {}, v), h('span', { class: 'kbd' }, k));
    this.modal((close) => [
      h('h2', {}, 'Как собрать машину'),
      h('ol', { class: 'steps' },
        h('li', { html: '<b>Рама.</b> Инструмент «Балка» (B): кликай точки на сетке — получится цепочка труб. Клик по жёлтой вершине — автосоединение. Мастерская — это 3D-решётка из кубиков. Точки ставятся в узлы активного среза (он выбирается по взгляду камеры и проходит через последнюю поставленную точку). Веди мышь вдоль оси от точки — балка прилипнет к X/Y/Z (так ставятся стойки). <b>Q/E</b> или <b>Shift+колесо</b> — двигать срез, <b>1/2/3</b> — зафиксировать срез, <b>0</b> — авто.' }),
        h('li', { html: '<b>Пол / кузов.</b> «Прямоугольник» (R) или «Многоугольник» (P) создают пластины. Можно рисовать прямо на гранях деталей. Скругление углов — в параметрах.' }),
        h('li', { html: '<b>Колёса.</b> Переключись на вертикальную плоскость (<b>3</b> — бок), «Круг» (C) — нарисуй диск, выбери материал <b>Резина</b>, «Тяни-толкай» (T) — вытяни на ширину шины. Круг с большим числом сторон = цилиндр, с малым — многогранник.' }),
        h('li', { html: '<b>Ось.</b> Балка с профилем «Пруток/вал» между колёсами. Соедини колёса с осью (J).' }),
        h('li', { html: '<b>Подшипники</b> (N): кликни по раме/стойке, затем по оси или колесу — ось начнёт свободно вращаться относительно рамы. Деталь не должна быть жёстко соединена с рамой.' }),
        h('li', { html: '<b>Привод.</b> «Шестерня» (G): поставь на ось. «Электромотор» (M) — на раму, затем шестерню на вал мотора. Шестерни сцепляются, если расстояние между осями = сумме радиусов (зелёная линия). <b>F</b> в инструменте шестерни подгоняет число зубьев. Передаточное число = Z₂/Z₁.' }),
        h('li', { html: '<b>Дифференциал</b> (D). Цельная ось в повороте скребёт колёсами и машина плохо рулит. Раздели ось на две полуоси, каждую — на свой подшипник, поставь дифференциал (рама → левая → правая полуось) и шестерню на него.' }),
        h('li', { html: '<b>Руль.</b> «Шарнир» (H) с вертикальной осью между рамой и поворотным кулаком; на кулак — короткий вал и колесо на подшипнике.' }),
        h('li', { html: '<b>Управление.</b> «Сиденье» (K) на пол, затем «Провод» (L): кликни мотор (газ), шарниры (руль), подшипники (тормоз). Если машина едет назад — включи инверсию провода или «Реверс» у мотора.' }),
        h('li', { html: '<b>Испытание</b> — F5. W/S газ, A/D руль, Пробел тормоз, C камера, R перезапуск, Esc назад.' }),
      ),
      h('h4', { style: { margin: '14px 0 6px', color: 'var(--muted)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' } }, 'Клавиши'),
      h('div', { class: 'help-grid' },
        row('V', 'Выбор / гизмо'), row('B', 'Балка'), row('R', 'Прямоугольник'), row('P', 'Многоугольник'), row('C', 'Круг'),
        row('T', 'Тяни-толкай'), row('J', 'Соединить'), row('N', 'Подшипник'), row('H', 'Шарнир'), row('U', 'Амортизатор'),
        row('G', 'Шестерня'), row('D', 'Дифференциал'), row('M', 'Электромотор'), row('I', 'ДВС'), row('K', 'Сиденье'), row('L', 'Провод'),
        row('O', 'Материал'), row('X', 'Удалить'), row('Tab', 'Сменить ось узла'), row('[ ]', 'Зубья / стороны'), row('Q / E', 'Плоскость ↓ / ↑'),
        row('0', 'Срез сетки: авто'), row('1 2 3', 'Срез XZ / XY / YZ'), row('Shift+колесо', 'Срез сквозь решётку'), row('Ctrl+Z / Y', 'Отмена / повтор'), row('Ctrl+D', 'Дублировать'), row('Пробел', 'Гизмо: сдвиг/поворот'),
        row('Del', 'Удалить выбранное'), row('F5', 'Испытать / назад')),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Понятно')),
    ], { wide: true });
  }

  showSettings() {
    const app = this.app;
    const s = app.settings;
    this.modal((close) => {
      const q = h('select', { onchange: (e) => { s.quality = e.target.value; app.saveSettings(); } },
        ...[['high', 'Высокое (AO, bloom, SMAA)'], ['medium', 'Среднее (bloom, SMAA)'], ['low', 'Низкое (быстро)']].map(([k, v]) => h('option', { value: k, selected: s.quality === k }, v)));
      const tog = (key, label) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: s[key], onchange: (e) => { s[key] = e.target.checked; app.saveSettings(); } }), h('span', { class: 'sw' }), label);
      return [
        h('h2', {}, 'Настройки'),
        h('div', { class: 'field' }, h('span', {}, 'Качество графики'), q),
        h('div', { class: 'field' }, h('span', {}, 'Звук моторов'), tog('sound', '')),
        h('div', { class: 'field' }, h('span', {}, 'Столкновения деталей между собой'), tog('selfCollision', '')),
        h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Самостолкновения реалистичнее, но требуют аккуратной сборки: пересекающиеся детали будут расталкиваться.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Готово')),
      ];
    });
  }
}
