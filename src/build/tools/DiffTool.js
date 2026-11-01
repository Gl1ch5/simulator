// Differential placement: frame -> left half-shaft -> right half-shaft.
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { Differential } from '../../parts/Differential.js';
import { worldAxisLine } from '../../parts/PartFactory.js';
import { partName } from '../../parts/registry.js';
import { ghostOf, dot, polyline } from '../overlays.js';
import { A, QA, quatYTo, closestOnLine } from '../../core/math.js';

const SHAFT_TYPES = ['beam', 'shape'];

export class DiffTool extends Tool {
  constructor(b) { super(b); this.id = 'diff'; this.name = 'Дифференциал'; this.hotkey = 'D'; }
  reset() { super.reset(); this.baseHit = null; this.left = null; }
  hint() {
    if (!this.baseHit) return 'Шаг 1: кликни по РАМЕ в месте между полуосями (корпус дифференциала крепится к ней)';
    if (!this.left) return 'Шаг 2: кликни ЛЕВУЮ полуось (вал на подшипнике)';
    return 'Шаг 3: кликни ПРАВУЮ полуось. Потом поставь на дифференциал шестерню (G) и сцепи её с мотором';
  }
  candidate(rightId) {
    const lp = this.bp.get(this.left);
    const line = worldAxisLine(lp);
    const pos = closestOnLine(line.origin, line.dir, this.baseHit.point);
    return Differential.create({ pos: A(pos), quat: QA(quatYTo(line.dir)), base: this.baseHit.partId, left: this.left, right: rightId });
  }
  onMove(snap, e, ndc) {
    this.clearPreview();
    const hit = this.build.snapper.pickPart(ndc);
    this.build.setHover(hit ? hit.partId : null);
    if (this.baseHit) this.preview.add(dot(this.baseHit.point, 0x3dff8a, 0.02));
    if (this.left) {
      const ok = hit && hit.partId !== this.left && SHAFT_TYPES.includes(this.bp.get(hit.partId).type);
      this.preview.add(ghostOf(this.candidate(ok ? hit.partId : null), !ok));
      if (hit) this.preview.add(polyline([new THREE.Vector3(...this.candidate(null).pos), hit.point], 0x39d0ff, false, true));
    }
  }
  onDown(snap, e, ndc) {
    const hit = this.build.snapper.pickPart(ndc);
    if (!this.baseHit) {
      if (!snap || snap.partId == null) { this.build.toast('Кликни по детали рамы', 'warn'); return; }
      this.baseHit = snap;
      return;
    }
    if (!hit || !SHAFT_TYPES.includes(this.bp.get(hit.partId).type) || hit.partId === this.baseHit.partId) {
      this.build.toast('Кликни по валу (балке-прутку) или колесу', 'warn');
      return;
    }
    if (!this.left) { this.left = hit.partId; return; }
    if (hit.partId === this.left) return;
    this.bp.commit();
    const d = this.bp.add(this.candidate(hit.partId));
    this.build.toast(`Дифференциал: ${partName(this.bp.get(this.left))} ↔ ${partName(this.bp.get(hit.partId))}`);
    this.build.select(d.id);
    this.reset();
  }
  cancel() { if (this.baseHit) { this.reset(); return true; } return false; }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}
