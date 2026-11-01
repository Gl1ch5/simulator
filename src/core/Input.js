// Keyboard state tracker (polling) + key-down event dispatch.
import { bus } from './EventBus.js';

class InputState {
  constructor() {
    this.down = new Set();
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (!this.down.has(e.code)) bus.emit('key', e);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      bus.emit('keyup', e);
    });
    window.addEventListener('blur', () => this.down.clear());
  }
  is(code) { return this.down.has(code); }
  any(...codes) { return codes.some((c) => this.down.has(c)); }
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export const input = new InputState();
