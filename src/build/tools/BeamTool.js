import * as THREE from 'three';
import { Tool } from './Tool.js';
import { Beam } from '../../parts/Beam.js';
import { ghostOf, label } from '../overlays.js';
import { A } from '../../core/math.js';

export class BeamTool extends Tool {
  constructor(b) { super(b); this.id = 'beam'; this.name = 'Балка (отрезок)'; this.hotkey = 'B'; this.start = null; this.lastBeam = null; }
  reset() { super.reset(); this.start = null; this.lastBeam = null; }
  hint() {
    return this.start
      ? 'Кликни вторую точку. Веди мышь вдоль оси — балка прилипнет к <b style="color:#ff6b6b">X</b>/<b style="color:#6bff8a">Y</b>/<b style="color:#6b9bff">Z</b> · <b>ПКМ/Esc</b> — закончить цепочку'
      : 'Кликни начальную точку балки. Жёлтая точка — привязка к вершине детали (автосоединение)';
  }
  snapOptions(e) {
    if (this.start && e?.shiftKey) return { constrainLine: { origin: this.start.point, dir: this.build.workPlane.normal } };
    return this.start ? { inferFrom: this.start.point } : {};
  }
  makePart(a, b) {
    const s = this.settings;
    return Beam.create({ a: A(a), b: A(b), profile: s.beamProfile, size: s.beamSize, material: s.material });
  }
  onMove(snap) {
    this.clearPreview();
    if (!this.start || !snap) return;
    const len = snap.point.distanceTo(this.start.point);
    if (len < 1e-4) return;
    this.preview.add(ghostOf(this.makePart(this.start.point, snap.point)));
    this.preview.add(label(`${len.toFixed(3)} м`, this.start.point.clone().add(snap.point).multiplyScalar(0.5)));
  }
  onDown(snap) {
    if (!snap) return;
    if (!this.start) {
      this.start = snap;
      return;
    }
    if (snap.point.distanceTo(this.start.point) < 1e-4) return;
    this.bp.commit();
    const part = this.bp.add(this.makePart(this.start.point, snap.point));
    this.build.autoConnect(part.id, [this.start, snap]);
    if (this.lastBeam && this.settings.autoConnect && this.bp.get(this.lastBeam)) {
      this.bp.connect(part.id, this.lastBeam, A(this.start.point));
    }
    this.lastBeam = part.id;
    this.start = { ...snap, partId: snap.partId };
    this.clearPreview();
  }
  cancel() {
    if (this.start) { this.reset(); return true; }
    return false;
  }
}
