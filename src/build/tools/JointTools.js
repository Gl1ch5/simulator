// Bearing / hinge / spring placement: click the fixed part, then the moving part.
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { PART_TYPES, partName } from '../../parts/registry.js';
import { worldAxisLine } from '../../parts/PartFactory.js';
import { ghostOf, arrow, dot, polyline } from '../overlays.js';
import { A, QA, AXES, quatYTo, closestOnLine } from '../../core/math.js';

const NAMES = { bearing: 'Подшипник', hinge: 'Шарнир', spring: 'Амортизатор' };

class JointTool extends Tool {
  constructor(b, type, hotkey, axis) {
    super(b);
    this.type = type; this.id = type; this.name = NAMES[type]; this.hotkey = hotkey; this.axis = axis;
  }
  reset() { super.reset(); this.baseHit = null; }
  cycleAxis() { const o = ['X', 'Y', 'Z']; this.axis = o[(o.indexOf(this.axis) + 1) % 3]; }
  axisFor(movingPart) {
    if (this.type === 'bearing' && movingPart) {
      const line = worldAxisLine(movingPart);
      if (line) return line;
    }
    return null;
  }
  hint() {
    const ax = this.type === 'bearing' ? 'ось берётся от вращающейся детали' : `ось: <b>${this.axis}</b> (<b>Tab</b>)`;
    return this.baseHit
      ? `Шаг 2: кликни ПОДВИЖНУЮ деталь (${this.type === 'hinge' ? 'поворотный кулак/стойка' : this.type === 'spring' ? 'рычаг/ось' : 'колесо, вал'}) · ${ax}`
      : `Шаг 1: кликни НЕПОДВИЖНУЮ деталь (рама) в точке установки · ${ax}`;
  }
  build3(baseHit, movingId) {
    const moving = movingId != null ? this.bp.get(movingId) : null;
    let pos = baseHit.point.clone(), dir = AXES[this.axis].clone();
    const line = this.axisFor(moving);
    if (line) { dir = line.dir.clone(); pos = closestOnLine(line.origin, line.dir, baseHit.point); }
    return PART_TYPES[this.type].create({ pos: A(pos), quat: QA(quatYTo(dir)), base: baseHit.partId, moving: movingId });
  }
  onMove(snap, e, ndc) {
    this.clearPreview();
    const hit = this.build.snapper.pickPart(ndc);
    this.build.setHover(hit ? hit.partId : null);
    if (!this.baseHit) {
      if (snap) {
        this.preview.add(dot(snap.point, snap.partId != null ? 0x3dff8a : 0xff5a4a, 0.02));
        if (this.type !== 'bearing') this.preview.add(arrow(snap.point, AXES[this.axis], 0.35));
      }
      return;
    }
    const movingId = hit && hit.partId !== this.baseHit.partId ? hit.partId : null;
    const part = this.build3(this.baseHit, movingId);
    this.preview.add(ghostOf(part, movingId == null));
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...part.quat));
    this.preview.add(arrow(new THREE.Vector3(...part.pos), dir, 0.35));
    if (hit) this.preview.add(polyline([this.baseHit.point, hit.point], 0x39d0ff, false, true));
  }
  onDown(snap, e, ndc) {
    if (!this.baseHit) {
      if (!snap || snap.partId == null) { this.build.toast('Кликни по детали (раме), к которой крепится узел', 'warn'); return; }
      const bp = this.bp.get(snap.partId);
      if (['bearing', 'hinge', 'spring'].includes(bp.type)) { this.build.toast('Нельзя крепить узел к узлу — выбери деталь', 'warn'); return; }
      this.baseHit = snap;
      return;
    }
    const hit = this.build.snapper.pickPart(ndc);
    if (!hit || hit.partId === this.baseHit.partId) { this.build.toast('Кликни по другой (подвижной) детали', 'warn'); return; }
    const mp = this.bp.get(hit.partId);
    if (['bearing', 'hinge', 'spring', 'gear'].includes(mp.type)) { this.build.toast('Подвижной стороной должна быть деталь (вал, колесо, стойка)', 'warn'); return; }
    if (this.bp.connected(this.baseHit.partId, hit.partId)) {
      this.build.toast('Внимание: эти детали жёстко соединены — узел будет заблокирован. Разъедини их инструментом J', 'warn');
    }
    this.bp.commit();
    const part = this.bp.add(this.build3(this.baseHit, hit.partId));
    this.build.toast(`${this.name} установлен: ${partName(this.bp.get(this.baseHit.partId))} ↔ ${partName(mp)}`);
    this.build.select(part.id);
    this.reset();
  }
  cancel() { if (this.baseHit) { this.reset(); return true; } return false; }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}

export const makeJointTools = (b) => ({
  bearing: new JointTool(b, 'bearing', 'N', 'X'),
  hinge: new JointTool(b, 'hinge', 'H', 'Y'),
  spring: new JointTool(b, 'spring', 'U', 'Y'),
});
