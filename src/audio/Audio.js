// Procedural engine / motor sounds via WebAudio (no samples).
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map();
    this.enabled = true;
    const unlock = () => { this.ensure(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }
  setEnabled(v) { this.enabled = v; if (this.master) this.master.gain.value = v ? 0.35 : 0; }

  voice(id, kind) {
    if (!this.ensure()) return null;
    if (this.voices.has(id)) return this.voices.get(id);
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = kind === 'engine' ? 4 : 1;
    filter.connect(out).connect(this.master);
    const oscs = [];
    if (kind === 'engine') {
      for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2, 0.15]]) {
        const o = ctx.createOscillator(); o.type = type;
        const og = ctx.createGain(); og.gain.value = g;
        o.connect(og).connect(filter); o.start();
        oscs.push({ o, mul });
      }
    } else {
      for (const [type, mul, g] of [['sine', 1, 0.4], ['triangle', 2, 0.15], ['sine', 3.02, 0.08]]) {
        const o = ctx.createOscillator(); o.type = type;
        const og = ctx.createGain(); og.gain.value = g;
        o.connect(og).connect(filter); o.start();
        oscs.push({ o, mul });
      }
    }
    const v = { kind, out, filter, oscs };
    this.voices.set(id, v);
    return v;
  }

  /** rpm, load 0..1 */
  update(id, kind, rpm, load) {
    const v = this.voice(id, kind);
    if (!v) return;
    const t = this.ctx.currentTime;
    if (kind === 'engine') {
      const f = Math.max(rpm, 300) / 60 * 2; // firing frequency (approx)
      for (const { o, mul } of v.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.03);
      v.filter.frequency.setTargetAtTime(300 + load * 2200 + rpm * 0.15, t, 0.05);
      v.out.gain.setTargetAtTime(0.12 + load * 0.25, t, 0.05);
    } else {
      const f = 60 + Math.abs(rpm) * 0.35;
      for (const { o, mul } of v.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.03);
      v.filter.frequency.setTargetAtTime(800 + Math.abs(rpm), t, 0.05);
      v.out.gain.setTargetAtTime(Math.min(0.25, Math.abs(rpm) / 8000 + load * 0.12), t, 0.05);
    }
  }

  stopAll() {
    for (const v of this.voices.values()) {
      try { v.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); for (const { o } of v.oscs) o.stop(this.ctx.currentTime + 0.3); } catch { /* ignore */ }
    }
    this.voices.clear();
  }
}

export const audio = new AudioSystem();
