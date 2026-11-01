import { h } from './dom.js';
import { ICONS } from './icons.js';
import { bus } from '../core/EventBus.js';
import { TOOL_GROUPS } from '../build/tools/index.js';

export class Toolbar {
  constructor(ui) {
    const build = ui.app.build;
    this.buttons = {};
    this.el = h('div', { class: 'toolbar panel' });
    this.tip = h('div', { class: 'tooltip hidden' });
    document.body.append(this.tip);
    for (const g of TOOL_GROUPS) {
      this.el.append(h('div', { class: 'group-title' }, g.title));
      for (const id of g.tools) {
        const t = build.tools[id];
        const b = h('button', {
          class: 'tool', html: (ICONS[id] || '') + (t.hotkey ? `<span class="hk">${t.hotkey}</span>` : ''),
          onclick: () => build.setTool(id),
          onmouseenter: (e) => this.showTip(e, `${t.name}${t.hotkey ? `  <span class="kbd">${t.hotkey}</span>` : ''}`),
          onmouseleave: () => this.tip.classList.add('hidden'),
        });
        this.buttons[id] = b;
        this.el.append(b);
      }
    }
    bus.on('tool:changed', (id) => {
      for (const [k, b] of Object.entries(this.buttons)) b.classList.toggle('active', k === id);
    });
    this.buttons[build.toolId]?.classList.add('active');
  }
  showTip(e, html) {
    const r = e.currentTarget.getBoundingClientRect();
    this.tip.innerHTML = html;
    this.tip.style.left = r.right + 10 + 'px';
    this.tip.style.top = r.top + r.height / 2 - 14 + 'px';
    this.tip.classList.remove('hidden');
  }
}
