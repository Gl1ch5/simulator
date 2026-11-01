// Open differential: carrier (with a ring gear mounted on it) splits torque equally
// between two half-shafts and lets them turn at different speeds in corners.
// Constraint: w_carrier = (w_left + w_right) / 2 (speeds relative to the frame).
import * as THREE from 'three';
import { componentMaterial } from '../render/Materials.js';
import { F } from './common.js';

export const Differential = {
  label: 'Дифференциал',
  create({ pos, quat, base, left, right }) {
    return { type: 'diff', pos, quat, base, left, right, size: 0.1 };
  },
  mesh(p) {
    const g = new THREE.Group();
    const s = p.size;
    const housing = new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 28, 18), componentMaterial('darkSteel'));
    housing.scale.set(1, 0.8, 1);
    g.add(housing);
    for (const sy of [-1, 1]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.18, s * 0.22, s * 0.5, 16), componentMaterial('darkSteel'));
      tube.position.y = sy * s * 0.55;
      g.add(tube);
    }
    // rotating carrier with bevel gears (spins in simulation)
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    for (let i = 0; i < 2; i++) {
      const bevel = new THREE.Mesh(new THREE.ConeGeometry(s * 0.2, s * 0.15, 12), componentMaterial('brass'));
      bevel.rotation.z = Math.PI / 2;
      bevel.position.x = (i ? 1 : -1) * s * 0.42;
      if (i) bevel.rotation.z = -Math.PI / 2;
      rotor.add(bevel);
    }
    g.add(rotor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.57, 0.003, 6, 40), componentMaterial('accentGlow'));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    return g;
  },
  snapPoints() { return [new THREE.Vector3()]; },
  axisLine() { return { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0) }; },
  mass() { return 6; },
  colliders() {
    return [{ kind: 'ball', radius: 0.05, ghost: true, massOverride: 6, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
  },
  fields() {
    return [F.number('size', 'Размер', 0.04, 0.4, 0.005, 'м'), F.info('Принцип', () => 'ω корпуса = (ωЛ + ωП) / 2')];
  },
};
