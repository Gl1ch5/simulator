import { h } from './dom.js';
import { ICONS } from './icons.js';
import { bus } from '../core/EventBus.js';
import { buildBuggy } from '../examples/buggy.js';

export class TopBar {
  constructor(ui) {
    const app = ui.app;
    this.ui = ui;
    this.modeBtn = h('button', { class: 'btn primary', onclick: () => app.toggleMode(), title: 'F5' });
    this.nameInput = h('input', { class: 'bp-name', type: 'text', value: app.blueprint.name, onchange: (e) => { app.blueprint.name = e.target.value; app.blueprint.autosave(); } });
    const file = h('input', { type: 'file', accept: '.json', class: 'hidden', onchange: (e) => this.importFile(e) });
    this.el = h('div', { class: 'topbar panel' },
      h('div', { class: 'brand' }, h('span', { class: 'name' }, 'FORGE'), h('span', { class: 'sub' }, 'физический конструктор')),
      h('div', { class: 'sep' }),
      this.nameInput,
      h('button', { class: 'btn icon', title: 'Отменить (Ctrl+Z)', html: ICONS.undo, onclick: () => app.blueprint.undo() }),
      h('button', { class: 'btn icon', title: 'Повторить (Ctrl+Y)', html: ICONS.redo, onclick: () => app.blueprint.redo() }),
      h('div', { class: 'spacer' }),
      this.modeBtn,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => this.newBlueprint(), html: ICONS.file + '<span>Новый</span>' }),
      h('button', { class: 'btn', onclick: () => { buildBuggy(app.blueprint); ui.toast('Загружен пример: электробагги'); }, html: ICONS.car + '<span>Пример</span>' }),
      h('button', { class: 'btn icon', title: 'Сохранить в файл', html: ICONS.download, onclick: () => this.exportFile() }),
      h('button', { class: 'btn icon', title: 'Открыть файл', html: ICONS.open, onclick: () => file.click() }),
      file,
      h('div', { class: 'sep' }),
      h('button', { class: 'btn icon', title: 'Настройки', html: ICONS.settings, onclick: () => ui.showSettings() }),
      h('button', { class: 'btn icon', title: 'Справка (F1)', html: ICONS.help, onclick: () => ui.showHelp() }),
    );
    bus.on('mode', (m) => this.setMode(m));
    bus.on('blueprint:changed', (bp) => { if (document.activeElement !== this.nameInput) this.nameInput.value = bp.name; });
    this.setMode('build');
  }
  setMode(m) {
    this.modeBtn.className = m === 'build' ? 'btn primary' : 'btn danger';
    this.modeBtn.innerHTML = m === 'build' ? ICONS.play + '<span>Испытать</span> <span class="kbd">F5</span>' : ICONS.stop + '<span>В мастерскую</span> <span class="kbd">Esc</span>';
  }
  newBlueprint() {
    const bp = this.ui.app.blueprint;
    bp.commit();
    bp.clear();
    bp.name = 'Без названия';
    bp.changed();
    this.ui.toast('Новый проект. Ctrl+Z — вернуть предыдущий');
  }
  exportFile() {
    const bp = this.ui.app.blueprint;
    const blob = new Blob([JSON.stringify(bp.toJSON(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (bp.name || 'vehicle').replace(/[^\wа-яё\- ]/gi, '_') + '.forge.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async importFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (!Array.isArray(json.parts)) throw new Error('неверный формат');
      this.ui.app.blueprint.load(json);
      this.ui.toast('Загружено: ' + (json.name || f.name));
    } catch (err) { this.ui.toast('Не удалось открыть файл: ' + err.message, 'error'); }
    e.target.value = '';
  }
}
