// Gear, motor, engine and seat placement.
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { Gear } from '../../parts/Gear.js';
import { Motor, Engine, MOTOR_VARIANTS, ENGINE_VARIANTS } from '../../parts/Power.js';
import { Seat } from '../../parts/Seat.js';
import { worldAxisLine } from '../../parts/PartFactory.js';
import { ghostOf, label, arrow } from '../overlays.js';
import { A, QA, V, Q, AXES, quatYTo, closestOnLine, snapScalar } from '../../core/math.js';
import { gearRadius } from '../../geometry/gear.js';

const AXIS_ORDER = ['X', 'Y', 'Z'];

export class GearTool extends Tool {
  constructor(b) { super(b); this.id = 'gear'; this.name = 'Шестерня'; this.hotkey = 'G'; }
  reset() { super.reset(); this.candidate = null; this.fit = null; }
  hint() {
    const s = this.settings;
    let h = `Наведи на вал, ось колеса, вал мотора или дифференциал и кликни · зубьев: <b>${s.gearTeeth}</b> (<b>[ ]</b>), Ø ${(gearRadius(s.gearTeeth, s.gearModule) * 2).toFixed(3)} м`;
    if (this.fit) h += ` · <b>F</b> — подогнать до ${this.fit} зуб. для зацепления`;
    return h;
  }
  makeGear(part, hitPoint) {
    const line = worldAxisLine(part);
    if (!line) return null;
    let center;
    const onRotor = ['motor', 'engine', 'diff'].includes(part.type);
    if (onRotor) center = line.origin;
    else {
      center = closestOnLine(line.origin, line.dir, hitPoint);
      // snap along the axis
      const t = snapScalar(center.clone().sub(line.origin).dot(line.dir), this.build.workPlane.step / 2);
      center = line.origin.clone().addScaledVector(line.dir, t);
    }
    const s = this.settings;
    return Gear.create({ pos: A(center), quat: QA(onRotor ? Q(part.quat) : quatYTo(line.dir)), teeth: s.gearTeeth, module: s.gearModule, mount: part.id, material: s.material === 'rubber' ? 'steel' : s.material });
  }
  computeFit(g) {
    const center = V(g.pos), axis = new THREE.Vector3(0, 1, 0).applyQuaternion(Q(g.quat));
    let best = null;
    for (const o of this.bp.all()) {
      if (o.type !== 'gear') continue;
      const oa = new THREE.Vector3(0, 1, 0).applyQuaternion(Q(o.quat));
      if (Math.abs(oa.dot(axis)) < 0.985) continue;
      const d = V(o.pos).sub(center);
      const axial = d.dot(axis);
      if (Math.abs(axial) > 0.05) continue;
      const perp = d.addScaledVector(axis, -axial).length();
      const need = perp - Gear.radius(o);
      const teeth = Math.round((need * 2) / g.module);
      if (teeth >= 6 && teeth <= 120 && (!best || perp < best.perp)) best = { teeth, perp };
    }
    return best ? best.teeth : null;
  }
  onMove(snap, e, ndc) {
    this.clearPreview();
    const hit = this.build.snapper.pickPart(ndc, (p) => ['beam', 'shape', 'motor', 'engine', 'diff'].includes(p.type));
    this.build.setHover(hit ? hit.partId : null);
    this.candidate = null; this.fit = null;
    if (!hit) { this.build.updateHint(); return; }
    const g = this.makeGear(this.bp.get(hit.partId), hit.point);
    if (!g) return;
    this.candidate = g;
    const f = this.computeFit(g);
    if (f && f !== g.teeth) this.fit = f;
    this.preview.add(ghostOf(g));
    this.preview.add(label(`Z=${g.teeth}`, V(g.pos)));
    this.build.updateHint();
  }
  onDown() {
    if (!this.candidate) return;
    this.bp.commit();
    const g = this.bp.add(this.candidate);
    this.build.select(g.id);
    this.reset();
  }
  onKey(e) {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      const t = this.settings.gearTeeth + (e.code === 'BracketLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
      this.build.setSetting('gearTeeth', Math.max(6, Math.min(120, t)));
      return true;
    }
    if (e.code === 'KeyF' && this.fit) { this.build.setSetting('gearTeeth', this.fit); return true; }
    return false;
  }
  deactivate() { super.deactivate(); this.build.setHover(null); }
}

/** Orientation with local +Y = axis and local +Z as close to the surface normal as possible. */
function orientOnSurface(axis, normal) {
  const y = axis.clone().normalize();
  let z = normal.clone().addScaledVector(y, -normal.dot(y));
  if (z.lengthSq() < 1e-4) z = Math.abs(y.y) < 0.9 ? new THREE.Vector3(0, 1, 0).addScaledVector(y, -y.y) : new THREE.Vector3(1, 0, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Distance from the centre of a box-shaped extent to its face along direction n. */
function halfExtentAlong(q, ext, n) {
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) => v.applyQuaternion(q));
  return Math.abs(ax[0].dot(n)) * ext[0] / 2 + Math.abs(ax[1].dot(n)) * ext[1] / 2 + Math.abs(ax[2].dot(n)) * ext[2] / 2;
}

class SurfaceMountTool extends Tool {
  constructor(b, opts) { super(b); Object.assign(this, opts); }
  reset() { super.reset(); this.candidate = null; }
  cycleAxis() { this.axis = AXIS_ORDER[(AXIS_ORDER.indexOf(this.axis) + 1) % 3]; }
  snapOptions() { return { preferSurface: true }; }
  onMove(snap) {
    this.clearPreview();
    this.candidate = null;
    if (!snap) return;
    const part = this.makePart(snap);
    const ok = snap.partId != null && !['bearing', 'hinge', 'spring', 'gear'].includes(this.bp.get(snap.partId)?.type);
    this.candidate = ok ? part : null;
    this.preview.add(ghostOf(part, !ok));
    if (this.axis) this.preview.add(arrow(V(part.pos), new THREE.Vector3(0, 1, 0).applyQuaternion(Q(part.quat)), 0.4));
  }
  onDown(snap) {
    if (!this.candidate) { this.build.toast('Кликни по поверхности детали (рамы/пластины)', 'warn'); return; }
    this.bp.commit();
    const p = this.bp.add(this.candidate);
    if (this.settings.autoConnect && snap.partId != null) this.bp.connect(p.id, snap.partId, A(snap.point));
    this.build.select(p.id);
    this.reset();
  }
  onKey(e) { return false; }
}

export class MotorTool extends SurfaceMountTool {
  constructor(b) { super(b, { id: 'motor', name: 'Электромотор', hotkey: 'M', axis: 'X' }); }
  hint() { return `Кликни по раме — мотор встанет на поверхность · вал по оси <b>${this.axis}</b> (<b>Tab</b>) · модель: ${MOTOR_VARIANTS[this.settings.motorVariant].name}`; }
  makePart(snap) {
    const spec = MOTOR_VARIANTS[this.settings.motorVariant];
    const q = orientOnSurface(AXES[this.axis], snap.normal);
    const off = halfExtentAlong(q, [spec.r * 2.2, spec.len, spec.r * 2.2], snap.normal);
    const pos = snap.point.clone().addScaledVector(snap.normal, off);
    return Motor.create({ pos: A(pos), quat: QA(q), base: snap.partId, variant: this.settings.motorVariant });
  }
}

export class EngineTool extends SurfaceMountTool {
  constructor(b) { super(b, { id: 'engine', name: 'ДВС', hotkey: 'I', axis: 'X' }); }
  hint() { return `Кликни по раме — двигатель встанет на поверхность · выходной вал по оси <b>${this.axis}</b> (<b>Tab</b>) · ${ENGINE_VARIANTS[this.settings.engineVariant].name}`; }
  makePart(snap) {
    const spec = ENGINE_VARIANTS[this.settings.engineVariant];
    const q = orientOnSurface(AXES[this.axis], snap.normal);
    const off = halfExtentAlong(q, spec.size, snap.normal);
    const pos = snap.point.clone().addScaledVector(snap.normal, off);
    return Engine.create({ pos: A(pos), quat: QA(q), base: snap.partId, variant: this.settings.engineVariant });
  }
}

export class SeatTool extends SurfaceMountTool {
  constructor(b) { super(b, { id: 'seat', name: 'Сиденье + пульт', hotkey: 'K', axis: null }); this.yaw = 0; }
  cycleAxis() { this.yaw = (this.yaw + 1) % 4; }
  hint() { return 'Кликни по полу/раме — сиденье с рулём и педалями. <b>Tab</b> — повернуть на 90°. Голубая стрелка — направление «вперёд»'; }
  makePart(snap) {
    const up = snap.normal.y > 0.5 ? snap.normal.clone() : new THREE.Vector3(0, 1, 0);
    const q = quatYTo(up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw * Math.PI / 2 + Math.PI / 2));
    return Seat.create({ pos: A(snap.point), quat: QA(q), base: snap.partId });
  }
}
