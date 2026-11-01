// The editable vehicle description: parts + rigid connections. JSON-serialisable,
// with snapshot-based undo / redo.
import { bus } from '../core/EventBus.js';
import { CONFIG } from '../core/config.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const REF_KEYS = ['base', 'moving', 'mount', 'left', 'right'];

export class Blueprint {
  constructor() {
    this.parts = new Map();
    this.connections = []; // { a, b, p:[x,y,z] }
    this.nextId = 1;
    this.undoStack = [];
    this.redoStack = [];
    this.name = 'Без названия';
  }

  // ---- queries ----
  get(id) { return this.parts.get(id); }
  all() { return [...this.parts.values()]; }
  connected(a, b) { return this.connections.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)); }
  connectionsOf(id) { return this.connections.filter((c) => c.a === id || c.b === id); }
  dependents(id) {
    return this.all().filter((p) => REF_KEYS.some((k) => p[k] === id));
  }

  // ---- mutations (call commit() before a user-level change for undo) ----
  add(part) {
    part.id = this.nextId++;
    this.parts.set(part.id, part);
    this.changed();
    return part;
  }
  update(id, patch) {
    const p = this.parts.get(id);
    if (!p) return;
    Object.assign(p, patch);
    this.changed();
  }
  remove(id) {
    if (!this.parts.has(id)) return;
    // cascade: components that reference this part die with it
    for (const dep of this.dependents(id)) this.remove(dep.id);
    this.parts.delete(id);
    this.connections = this.connections.filter((c) => c.a !== id && c.b !== id);
    for (const p of this.parts.values()) {
      if (p.wires) p.wires = p.wires.filter((w) => w.to !== id);
    }
    this.changed();
  }
  connect(a, b, p) {
    if (a === b || this.connected(a, b)) return false;
    this.connections.push({ a, b, p });
    this.changed();
    return true;
  }
  disconnect(a, b) {
    const n = this.connections.length;
    this.connections = this.connections.filter((c) => !((c.a === a && c.b === b) || (c.a === b && c.b === a)));
    if (n !== this.connections.length) this.changed();
  }
  clear() {
    this.parts.clear();
    this.connections = [];
    this.nextId = 1;
    this.changed();
  }

  changed() { bus.emit('blueprint:changed', this); }

  // ---- history ----
  commit() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  // ---- serialisation ----
  snapshot() {
    return clone({ name: this.name, nextId: this.nextId, parts: this.all(), connections: this.connections });
  }
  restore(data) {
    this.parts.clear();
    for (const p of data.parts) this.parts.set(p.id, clone(p));
    this.connections = clone(data.connections || []);
    this.nextId = data.nextId || (Math.max(0, ...data.parts.map((p) => p.id)) + 1);
    this.name = data.name || this.name;
    this.changed();
  }
  toJSON() { return { format: 'forge-blueprint', version: 1, ...this.snapshot() }; }
  load(json) {
    this.commit();
    this.restore(json);
  }

  autosave() {
    try { localStorage.setItem(CONFIG.autosaveKey, JSON.stringify(this.toJSON())); } catch { /* storage might be unavailable */ }
  }
  static loadAutosave() {
    try {
      const raw = localStorage.getItem(CONFIG.autosaveKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
