// Beam / rod / tube between two points. Local +X is the beam direction.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { visualMaterial } from '../render/Materials.js';
import { getMaterial } from '../model/materials.js';
import { V, A, QA, quatXTo } from '../core/math.js';
import { CONFIG } from '../core/config.js';
import { F, MAT_FIELD } from './common.js';

export const PROFILES = {
  tube: 'Квадратная труба',
  pipe: 'Круглая труба',
  bar: 'Брус (сплошной)',
  rod: 'Пруток / вал (сплошной)',
};

export const Beam = {
  label: 'Балка',
  create({ a, b, profile = 'tube', size = CONFIG.beamSize, material = 'steel' }) {
    const pa = V(a), pb = V(b);
    const dir = pb.clone().sub(pa);
    const length = Math.max(dir.length(), 0.01);
    return {
      type: 'beam', material, profile, size, length,
      pos: A(pa.clone().add(pb).multiplyScalar(0.5)),
      quat: QA(quatXTo(dir)),
    };
  },
  mesh(p) {
    const mat = visualMaterial(p.material);
    let geo;
    if (p.profile === 'pipe' || p.profile === 'rod') {
      geo = new THREE.CylinderGeometry(p.size / 2, p.size / 2, p.length, 20, 1);
      geo.rotateZ(Math.PI / 2);
    } else {
      geo = new RoundedBoxGeometry(p.length, p.size, p.size, 2, Math.min(p.size * 0.15, 0.006));
    }
    const m = new THREE.Mesh(geo, mat);
    return m;
  },
  ends(p) { return [new THREE.Vector3(-p.length / 2, 0, 0), new THREE.Vector3(p.length / 2, 0, 0)]; },
  snapPoints(p) {
    const [a, b] = Beam.ends(p);
    return [a, b, new THREE.Vector3()];
  },
  axisLine() { return { origin: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0) }; },
  mass(p) {
    const s = p.size, w = Math.min(CONFIG.beamWall, s / 2);
    const rho = getMaterial(p.material).density;
    switch (p.profile) {
      case 'tube': return (s * s - (s - 2 * w) ** 2) * p.length * rho;
      case 'pipe': return Math.PI / 4 * (s * s - (s - 2 * w) ** 2) * p.length * rho;
      case 'rod': return Math.PI / 4 * s * s * p.length * rho;
      default: return s * s * p.length * rho;
    }
  },
  colliders(p) {
    const round = p.profile === 'pipe' || p.profile === 'rod';
    if (round) {
      return [{ kind: 'cylinder', halfHeight: p.length / 2, radius: p.size / 2,
        pos: new THREE.Vector3(), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2) }];
    }
    return [{ kind: 'cuboid', hx: p.length / 2, hy: p.size / 2, hz: p.size / 2, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
  },
  fields() {
    return [
      MAT_FIELD,
      F.select('profile', 'Профиль', PROFILES),
      F.number('size', 'Сечение', 0.01, 0.3, 0.005, 'м'),
      F.number('length', 'Длина', 0.02, 20, 0.01, 'м'),
    ];
  },
};
