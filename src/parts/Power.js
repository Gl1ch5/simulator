// Power units: electric motors and internal-combustion engines.
// Housing is centred at local origin, the output shaft points along local +Y.
import * as THREE from 'three';
import { componentMaterial } from '../render/Materials.js';
import { F } from './common.js';

export const MOTOR_VARIANTS = {
  small: { name: 'Э-мотор 2 кВт', stallTorque: 26, freeRpm: 3000, r: 0.05, len: 0.12, mass: 6, inertia: 0.004 },
  medium: { name: 'Э-мотор 8 кВт', stallTorque: 75, freeRpm: 4000, r: 0.07, len: 0.18, mass: 18, inertia: 0.012 },
  large: { name: 'Э-мотор 30 кВт', stallTorque: 230, freeRpm: 5000, r: 0.1, len: 0.26, mass: 45, inertia: 0.04 },
};

export const ENGINE_VARIANTS = {
  moto: { name: 'ДВС 1-цил. 250 см³', peakTorque: 22, peakRpm: 6500, maxRpm: 9500, idleRpm: 1300, mass: 28, inertia: 0.03,
    cylinders: 1, size: [0.22, 0.28, 0.22], gears: [3.0, 2.0, 1.45, 1.15, 0.95], reverse: 3.2 },
  i4: { name: 'ДВС 4-цил. 1.6 л', peakTorque: 150, peakRpm: 4200, maxRpm: 6800, idleRpm: 850, mass: 110, inertia: 0.15,
    cylinders: 4, size: [0.45, 0.42, 0.34], gears: [3.4, 2.1, 1.45, 1.1, 0.88], reverse: 3.3 },
  v8: { name: 'ДВС V8 5.0 л', peakTorque: 520, peakRpm: 4400, maxRpm: 7200, idleRpm: 700, mass: 210, inertia: 0.3,
    cylinders: 8, size: [0.62, 0.55, 0.6], gears: [2.9, 1.9, 1.35, 1.0, 0.8], reverse: 3.0 },
};

export const SHAFT_LEN = 0.06;

export const Motor = {
  label: 'Электромотор',
  isPower: true,
  create({ pos, quat, base, variant = 'medium' }) {
    return { type: 'motor', pos, quat, base, variant, invert: false };
  },
  spec(p) { return MOTOR_VARIANTS[p.variant] || MOTOR_VARIANTS.medium; },
  shaftTip(p) { const s = Motor.spec(p); return new THREE.Vector3(0, s.len / 2 + SHAFT_LEN * 0.7, 0); },
  mesh(p) {
    const s = Motor.spec(p);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.len * 0.8, 40), componentMaterial('motorBody'));
    g.add(body);
    // cooling fins
    const finGeo = new THREE.BoxGeometry(s.r * 0.12, s.len * 0.7, s.r * 0.25);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const f = new THREE.Mesh(finGeo, componentMaterial('motorBody'));
      f.position.set(Math.cos(a) * s.r * 1.02, 0, Math.sin(a) * s.r * 1.02);
      f.rotation.y = -a;
      g.add(f);
    }
    for (const sy of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 1.08, s.r * 1.08, s.len * 0.1, 40), componentMaterial('motorCap'));
      cap.position.y = sy * s.len * 0.45;
      g.add(cap);
    }
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(s.r * 1.09, 0.003, 6, 48), componentMaterial('accentGlow'));
    ringGlow.rotation.x = Math.PI / 2; ringGlow.position.y = s.len * 0.36;
    g.add(ringGlow);
    // terminal box
    const tb = new THREE.Mesh(new THREE.BoxGeometry(s.r * 0.7, s.len * 0.35, s.r * 0.5), componentMaterial('motorCap'));
    tb.position.set(0, 0, s.r * 1.1);
    g.add(tb);
    // feet
    const foot = new THREE.Mesh(new THREE.BoxGeometry(s.r * 2.2, s.len * 0.6, s.r * 0.2), componentMaterial('darkSteel'));
    foot.position.set(0, 0, -s.r * 1.05);
    g.add(foot);
    // rotor (spins in simulation)
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, SHAFT_LEN, 12), componentMaterial('chrome'));
    shaft.position.y = s.len / 2 + SHAFT_LEN / 2;
    rotor.add(shaft);
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.004, SHAFT_LEN * 0.8, 0.02), componentMaterial('brass'));
    key.position.y = s.len / 2 + SHAFT_LEN / 2;
    rotor.add(key);
    g.add(rotor);
    return g;
  },
  snapPoints(p) { return [new THREE.Vector3(), Motor.shaftTip(p)]; },
  axisLine(p) { return { origin: Motor.shaftTip(p), dir: new THREE.Vector3(0, 1, 0) }; },
  mass(p) { return Motor.spec(p).mass; },
  colliders(p) {
    const s = Motor.spec(p);
    return [{ kind: 'cylinder', halfHeight: s.len / 2, radius: s.r, massOverride: s.mass, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
  },
  fields() {
    const opts = Object.fromEntries(Object.entries(MOTOR_VARIANTS).map(([k, v]) => [k, v.name]));
    return [
      F.select('variant', 'Модель', opts),
      F.check('invert', 'Реверс вращения'),
      F.info('Момент / обороты', (p) => `${Motor.spec(p).stallTorque} Н·м / ${Motor.spec(p).freeRpm} об/мин`),
    ];
  },
};

export const Engine = {
  label: 'ДВС',
  isPower: true,
  create({ pos, quat, base, variant = 'i4' }) {
    return { type: 'engine', pos, quat, base, variant, invert: false, auto: true };
  },
  spec(p) { return ENGINE_VARIANTS[p.variant] || ENGINE_VARIANTS.i4; },
  shaftTip(p) { const s = Engine.spec(p); return new THREE.Vector3(0, s.size[1] / 2 + SHAFT_LEN * 0.7, 0); },
  mesh(p) {
    const s = Engine.spec(p);
    const [w, h, d] = s.size; // local: x width, y = shaft axis length, z depth
    const g = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.85, d * 0.8), componentMaterial('engineBlock'));
    g.add(block);
    // cylinders head on +X
    const n = s.cylinders === 8 ? 4 : s.cylinders;
    const banks = s.cylinders === 8 ? [-1, 1] : [0];
    for (const bank of banks) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.8, d * 0.5), componentMaterial('engineHead'));
      head.position.set(w * 0.42, 0, bank * d * 0.25);
      if (bank) head.rotation.y = 0;
      head.rotation.x = bank * 0.5;
      g.add(head);
      for (let i = 0; i < n; i++) {
        const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), componentMaterial('chrome'));
        plug.rotation.z = Math.PI / 2;
        plug.position.set(w * 0.6, -h * 0.3 + (i + 0.5) * (h * 0.6 / n), bank * d * 0.3);
        g.add(plug);
      }
    }
    // exhaust pipes
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h * 0.9, 12), componentMaterial('copper'));
    ex.position.set(w * 0.2, 0, d * 0.48);
    g.add(ex);
    // flywheel housing + rotor
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.42, d * 0.36, h * 0.12, 32), componentMaterial('darkSteel'));
    bell.position.y = h * 0.45;
    g.add(bell);
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, SHAFT_LEN, 12), componentMaterial('chrome'));
    shaft.position.y = h / 2 + SHAFT_LEN / 2;
    rotor.add(shaft);
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.15, d * 0.15, 0.02, 24), componentMaterial('brass'));
    pulley.position.y = -h * 0.47;
    rotor.add(pulley);
    g.add(rotor);
    // air filter
    const af = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.2, d * 0.2, 0.05, 24), componentMaterial('chrome'));
    af.rotation.z = Math.PI / 2;
    af.position.set(w * 0.62, h * 0.1, -d * 0.2);
    g.add(af);
    return g;
  },
  snapPoints(p) { return [new THREE.Vector3(), Engine.shaftTip(p)]; },
  axisLine(p) { return { origin: Engine.shaftTip(p), dir: new THREE.Vector3(0, 1, 0) }; },
  mass(p) { return Engine.spec(p).mass; },
  colliders(p) {
    const s = Engine.spec(p);
    return [{ kind: 'cuboid', hx: s.size[0] / 2, hy: s.size[1] / 2, hz: s.size[2] / 2, massOverride: s.mass, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
  },
  fields() {
    const opts = Object.fromEntries(Object.entries(ENGINE_VARIANTS).map(([k, v]) => [k, v.name]));
    return [
      F.select('variant', 'Модель', opts),
      F.check('invert', 'Реверс вращения'),
      F.check('auto', 'Автомат КПП'),
      F.info('Пик момента', (p) => `${Engine.spec(p).peakTorque} Н·м @ ${Engine.spec(p).peakRpm}`),
    ];
  },
};
