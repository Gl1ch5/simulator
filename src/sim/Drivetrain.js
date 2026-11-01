// Drivetrain solver: gear meshes, motors, engines with clutch + gearbox, brakes.
//
// Everything that spins is a "rotor":
//   - physical rotor: a Rapier rigid body (axle, wheel...) spinning in a bearing
//   - virtual rotor:  1-DOF crank of a motor / engine (inertia I, speed w)
// Couplings are velocity constraints solved with sequential impulses before every
// physics step, so torques, gear ratios and reaction torques are all physical.
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { CONFIG } from '../core/config.js';

const tmpQ = new THREE.Quaternion();
const RPM = 60 / (2 * Math.PI);

export class Drivetrain {
  constructor() {
    this.bodies = new Map();   // handle -> { body, w: Vector3, invI: Matrix3 }
    this.rotors = [];          // virtual rotors
    this.meshes = [];          // gear meshes
    this.brakes = [];          // bearing brakes/friction
    this.power = [];           // power units (motors / engines) -> virtual rotor
    this.diffs = [];           // open differentials
  }

  // ---------- registration ----------
  bodyEntry(body) {
    if (!body) return null;
    let e = this.bodies.get(body.handle);
    if (!e) { e = { body, w: new THREE.Vector3(), invI: new THREE.Matrix3() }; this.bodies.set(body.handle, e); }
    return e;
  }

  addVirtualRotor({ housing, axisLocal, inertia }) {
    const r = { virtual: true, housing: this.bodyEntry(housing), axisLocal: axisLocal.clone(), axis: axisLocal.clone(), I: inertia, w: 0, angle: 0, relW: 0 };
    this.rotors.push(r);
    return r;
  }

  physicalRotor(body, ref, axisLocal) {
    return { virtual: false, entry: this.bodyEntry(body), ref: this.bodyEntry(ref), axisLocal: axisLocal.clone(), axis: axisLocal.clone() };
  }

  /** gear = { rotor, radius, ratioFn?: ()=>g, clutchFn?: ()=>maxCrankTorque } */
  addMesh(a, b) { this.meshes.push({ a, b, acc: 0, torque: 0 }); }

  addBrake({ moving, base, axisLocal, part }) {
    this.brakes.push({ moving: this.bodyEntry(moving), base: this.bodyEntry(base), axisLocal: axisLocal.clone(), axis: axisLocal.clone(), part, input: 0, acc: 0 });
  }

  addPower(unit) { this.power.push(unit); }

  /** carrier: virtual rotor; left/right: physical rotors (half-shafts) */
  addDiff(carrier, left, right) { this.diffs.push({ carrier, left, right }); }

  // ---------- per step ----------
  readBodies() {
    for (const e of this.bodies.values()) {
      const av = e.body.angvel();
      e.w.set(av.x, av.y, av.z);
      const S = e.body.effectiveWorldInvInertiaSqrt();
      const el = S.elements; // m11 m12 m13 m22 m23 m33
      const s = new THREE.Matrix3().set(el[0], el[1], el[2], el[1], el[3], el[4], el[2], el[4], el[5]);
      e.invI.multiplyMatrices(s, s);
      const r = e.body.rotation();
      e.q = tmpQ.set(r.x, r.y, r.z, r.w).clone();
    }
  }

  writeBodies() {
    for (const e of this.bodies.values()) e.body.setAngvel({ x: e.w.x, y: e.w.y, z: e.w.z }, true);
  }

  rotorAxis(r) {
    const e = r.virtual ? r.housing : r.entry;
    r.axis.copy(r.axisLocal);
    if (e) r.axis.applyQuaternion(e.q);
    return r.axis;
  }

  /** Speed of a virtual rotor relative to its housing. */
  relSpeed(r) {
    const hw = r.housing ? r.housing.w.dot(r.axis) : 0;
    return r.w - hw;
  }

  step(dt, controls) {
    this.readBodies();
    for (const r of this.rotors) this.rotorAxis(r);
    for (const m of this.meshes) { for (const g of [m.a, m.b]) if (!g.rotor.virtual) this.rotorAxis(g.rotor); }
    for (const d of this.diffs) { this.rotorAxis(d.left); this.rotorAxis(d.right); }
    for (const b of this.brakes) {
      b.axis.copy(b.axisLocal);
      if (b.moving) b.axis.applyQuaternion(b.moving.q);
    }

    // 1. power units produce torque between crank and housing
    for (const u of this.power) u.update(dt, this, controls);

    // 2. iterate couplings
    for (const m of this.meshes) m.acc = 0;
    for (const b of this.brakes) b.acc = 0;
    const iters = CONFIG.drivetrainIterations;
    for (let it = 0; it < iters; it++) {
      for (const b of this.brakes) this.solveBrake(b, dt);
      for (const m of this.meshes) this.solveMesh(m, dt);
      for (const d of this.diffs) this.solveDiff(d);
    }
    for (const m of this.meshes) m.torque = m.acc / dt;

    this.writeBodies();
    for (const r of this.rotors) { r.relW = this.relSpeed(r); r.angle += r.relW * dt; }
  }

  // Build the sparse Jacobian of a gear's angular velocity about the mesh normal n.
  gearTerms(g, n, out) {
    const r = g.rotor;
    const k = g.radius;
    if (r.virtual) {
      const ratio = g.ratioFn ? g.ratioFn() : 1;
      if (ratio === 0) return false; // neutral
      const s = r.axis.dot(n);
      out.push({ rotor: r, c: (k * s) / ratio });
      if (r.housing) out.push({ e: r.housing, j: n.clone().multiplyScalar(-k) });
    } else {
      out.push({ e: r.entry, j: n.clone().multiplyScalar(k) });
      if (r.ref) out.push({ e: r.ref, j: n.clone().multiplyScalar(-k) });
    }
    return true;
  }

  applyTerms(terms, lambda) {
    for (const t of terms) {
      if (t.rotor) t.rotor.w += t.c * lambda / t.rotor.I;
      else t.e.w.add(t.j.clone().multiplyScalar(lambda).applyMatrix3(t.e.invI));
    }
  }

  solveTerms(terms) {
    let cdot = 0, K = 0;
    for (const t of terms) {
      if (t.rotor) { cdot += t.c * t.rotor.w; K += (t.c * t.c) / t.rotor.I; }
      else { cdot += t.j.dot(t.e.w); K += t.j.dot(t.j.clone().applyMatrix3(t.e.invI)); }
    }
    return { cdot, K };
  }

  solveMesh(m, dt) {
    const n = m.a.rotor.axis;
    const terms = [];
    if (!this.gearTerms(m.a, n, terms) || !this.gearTerms(m.b, n, terms)) return;
    const { cdot, K } = this.solveTerms(terms);
    if (K < 1e-12) return;
    let lambda = -cdot / K;
    // clutch limit (engines): crank torque = lambda * r / ratio
    let limit = Infinity;
    for (const g of [m.a, m.b]) {
      if (g.clutchFn) {
        const ratio = Math.abs(g.ratioFn ? g.ratioFn() : 1) || 1;
        limit = Math.min(limit, (g.clutchFn() * dt * ratio) / g.radius);
      }
    }
    const old = m.acc;
    m.acc = clamp(old + lambda, -limit, limit);
    lambda = m.acc - old;
    this.applyTerms(terms, lambda);
  }

  solveDiff(d) {
    const n = d.carrier.axis;
    const terms = [{ rotor: d.carrier, c: 1 }];
    if (d.carrier.housing) terms.push({ e: d.carrier.housing, j: n.clone().multiplyScalar(-1) });
    for (const side of [d.left, d.right]) {
      const s = Math.sign(side.axis.dot(n)) || 1;
      terms.push({ e: side.entry, j: n.clone().multiplyScalar(-0.5 * s) });
      if (side.ref) terms.push({ e: side.ref, j: n.clone().multiplyScalar(0.5 * s) });
    }
    // merge duplicate bodies (e.g. both shafts share the frame as reference)
    const merged = [];
    for (const t of terms) {
      const same = t.e && merged.find((m) => m.e === t.e);
      if (same) same.j.add(t.j); else merged.push(t.e ? { e: t.e, j: t.j.clone() } : t);
    }
    const { cdot, K } = this.solveTerms(merged);
    if (K < 1e-12) return;
    this.applyTerms(merged, -cdot / K);
  }

  solveBrake(b, dt) {
    if (!b.moving) return;
    const p = b.part;
    const maxT = (p.brake || 0) * b.input + (p.friction || 0) * 2;
    if (maxT <= 0) return;
    const terms = [{ e: b.moving, j: b.axis.clone() }];
    if (b.base) terms.push({ e: b.base, j: b.axis.clone().negate() });
    const { cdot, K } = this.solveTerms(terms);
    if (K < 1e-12) return;
    let lambda = -cdot / K;
    const limit = maxT * dt;
    const old = b.acc;
    b.acc = clamp(old + lambda, -limit, limit);
    lambda = b.acc - old;
    this.applyTerms(terms, lambda);
  }

  /** Apply an internal torque between a virtual rotor and its housing. */
  applyRotorTorque(r, torque, dt) {
    r.w += (torque * dt) / r.I;
    if (r.housing) r.housing.w.add(r.axis.clone().multiplyScalar(-torque * dt).applyMatrix3(r.housing.invI));
  }
}

// ---------- power unit models ----------

export class ElectricMotor {
  constructor(part, spec, rotor) {
    this.part = part; this.spec = spec; this.rotor = rotor;
    this.throttle = 0; this.torque = 0; this.power = 0;
    this.wFree = (spec.freeRpm / RPM);
  }
  get rpm() { return this.rotor.relW * RPM; }
  update(dt, dtrain) {
    const r = this.rotor;
    const w = dtrain.relSpeed(r);
    const thr = this.throttle * (this.part.invert ? -1 : 1);
    const dir = Math.sign(thr);
    let T = 0;
    if (dir !== 0) {
      // linear DC torque/speed curve, full torque when braking against rotation
      const along = w * dir;
      const k = along < 0 ? 1 : Math.max(0, 1 - along / this.wFree);
      T = thr * this.spec.stallTorque * k;
    }
    // internal friction / regen drag when idle
    T -= w * 0.004 * this.spec.stallTorque * (dir === 0 ? 1 : 0.15);
    this.torque = T;
    this.power = Math.abs(T * w);
    dtrain.applyRotorTorque(r, T, dt);
  }
}

export class CombustionEngine {
  constructor(part, spec, rotor) {
    this.part = part; this.spec = spec; this.rotor = rotor;
    this.throttle = 0; this.torque = 0; this.power = 0;
    this.gear = 1; // 0 = N, -1 = R, 1..n
    this.shiftTimer = 0;
    rotor.w = spec.idleRpm / RPM * (part.invert ? -1 : 1);
    this.load = 0;
  }
  get rpm() { return Math.abs(this.rotor.relW) * RPM; }
  ratio() {
    if (this.shiftTimer > 0) return 0;
    if (this.gear === 0) return 0;
    if (this.gear < 0) return -this.spec.reverse;
    return this.spec.gears[this.gear - 1];
  }
  gearLabel() { return this.shiftTimer > 0 ? '…' : this.gear === 0 ? 'N' : this.gear < 0 ? 'R' : String(this.gear); }
  curve(rpm) {
    const s = this.spec;
    const x = (rpm - s.peakRpm) / (s.maxRpm - s.idleRpm * 0.5);
    return s.peakTorque * Math.max(0.25, 1 - 1.6 * x * x);
  }
  clutch() {
    // centrifugal clutch: engages between 1.2x and 2x idle rpm
    const s = this.spec;
    const e = smoothstep(s.idleRpm * 1.15, s.idleRpm * 2.0, this.rpm);
    return e * s.peakTorque * 2.2;
  }
  update(dt, dtrain, controls) {
    const s = this.spec, r = this.rotor;
    const dirSign = this.part.invert ? -1 : 1;
    const wRel = dtrain.relSpeed(r) * dirSign; // positive when running correctly
    const rpm = wRel * RPM;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    let thr = Math.abs(this.throttle);
    // automatic gearbox: S/back held at standstill selects reverse
    if (this.part.auto) {
      const speed = controls?.speed ?? 0;
      if (this.throttle < -0.05 && speed < 1.0 && this.gear > 0) { this.gear = -1; this.shiftTimer = 0.3; }
      else if (this.throttle > 0.05 && this.gear < 0 && speed < 1.0) { this.gear = 1; this.shiftTimer = 0.3; }
      if (this.gear > 0 && this.shiftTimer === 0) {
        if (rpm > s.maxRpm * 0.9 && this.gear < s.gears.length) { this.gear++; this.shiftTimer = 0.25; }
        else if (rpm < s.peakRpm * 0.45 && this.gear > 1) { this.gear--; this.shiftTimer = 0.25; }
      }
      if (this.gear < 0) thr = Math.max(0, -this.throttle);
      else thr = Math.max(0, this.throttle);
    }
    // idle governor
    const idleNeed = clamp((s.idleRpm - rpm) / (s.idleRpm * 0.3), 0, 0.35);
    thr = Math.max(thr, idleNeed);
    // rev limiter
    if (rpm > s.maxRpm) thr = 0;
    const drive = thr * this.curve(Math.max(rpm, 0));
    const friction = s.peakTorque * (0.06 + 0.12 * Math.max(rpm, 0) / s.maxRpm) * Math.sign(wRel || 1);
    const T = (drive - friction) * dirSign;
    this.torque = T;
    this.load = thr;
    this.power = Math.max(0, drive * wRel);
    dtrain.applyRotorTorque(r, T, dt);
    // stalled engines restart automatically (starter motor)
    if (rpm < s.idleRpm * 0.3) r.w += (s.idleRpm * 0.5 / RPM) * dirSign * dt * 4;
  }
}
