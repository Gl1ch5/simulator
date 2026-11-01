// Push / pull: drag a plate face along its normal to turn it into a solid.
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { ghostOf, label, arrow } from '../overlays.js';
import { zRange } from '../../parts/Shape.js';
import { V, Q, snapScalar } from '../../core/math.js';

export class ExtrudeTool extends Tool {
  constructor(b) { super(b); this.id = 'extrude'; this.name = 'Тяни-толкай'; this.hotkey = 'T'; this.drag = null; }
  reset() { super.reset(); this.drag = null; }
  hint() {
    return this.drag
      ? 'Тяни мышь вдоль стрелки, отпусти — готово. Шаг = шаг сетки'
      : 'Наведи на пластину/круг и тяни грань (зажми ЛКМ). Так делаются колёса, блоки, валы';
  }
  snapOptions() { return { none: !!this.drag }; }
  onMove(snap, e, ndc) {
    if (!this.drag) {
      const hit = this.build.snapper.pickPart(ndc, (p) => p.type === 'shape');
      this.build.setHover(hit ? hit.partId : null);
      this.clearPreview();
      if (hit) {
        const part = this.bp.get(hit.partId);
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(Q(part.quat));
        const top = hit.normal.dot(n) > -0.5;
        this.preview.add(arrow(hit.point, top ? n : n.clone().negate(), 0.3, 0xffd23f));
      }
      return;
    }
    const d = this.drag;
    const ray = this.build.snapper.ray(ndc);
    // closest point between mouse ray and the extrusion line
    const w0 = ray.origin.clone().sub(d.anchor);
    const a = 1, b = ray.direction.dot(d.n), c = 1;
    const dd = ray.direction.dot(w0), e2 = d.n.dot(w0);
    const den = a * c - b * b;
    let t = den > 1e-6 ? (a * e2 - b * dd) / den : 0;
    t = snapScalar(t, this.build.workPlane.step / (this.build.workPlane.step >= 0.1 ? 2 : 1));
    let [z0, z1] = d.range;
    if (d.top) z1 = Math.max(z0 + 0.001, z1 + t); else z0 = Math.min(z1 - 0.001, z0 - t);
    d.result = { zOff: z0, depth: z1 - z0 };
    this.clearPreview();
    this.preview.add(ghostOf({ ...d.part, ...d.result }));
    this.preview.add(label(`${(z1 - z0).toFixed(3)} м`, d.anchor.clone().addScaledVector(d.n, d.top ? t : -t)));
  }
  onDown(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc, (p) => p.type === 'shape');
    if (!hit) return;
    const part = this.bp.get(hit.partId);
    const nz = new THREE.Vector3(0, 0, 1).applyQuaternion(Q(part.quat));
    const top = hit.normal.dot(nz) > -0.5;
    this.drag = { part: JSON.parse(JSON.stringify(part)), id: part.id, n: top ? nz : nz.clone().negate(), top, anchor: hit.point.clone(), range: zRange(part), result: null };
    this.build.app.orbit.enabled = false;
    const obj = this.build.objects.get(part.id);
    if (obj) obj.visible = false;
  }
  onUp() {
    if (!this.drag) return;
    const d = this.drag;
    this.build.app.orbit.enabled = true;
    const obj = this.build.objects.get(d.id);
    if (obj) obj.visible = true;
    if (d.result) {
      this.bp.commit();
      this.bp.update(d.id, d.result);
    }
    this.reset();
  }
  cancel() {
    if (this.drag) { const obj = this.build.objects.get(this.drag.id); if (obj) obj.visible = true; this.build.app.orbit.enabled = true; this.reset(); return true; }
    return false;
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}
