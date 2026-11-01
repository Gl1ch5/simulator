// Tiny pub/sub used to decouple UI, build tools and simulation.
export class EventBus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, ...args) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }
}

export const bus = new EventBus();
