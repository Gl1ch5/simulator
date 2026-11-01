// Joint components: bearing (free revolute), hinge (limited / steerable revolute),
// spring (prismatic suspension). All use local +Y as the axis.
import * as THREE from 'three';
import { componentMaterial } from '../render/Materials.js';
import { F } from './common.js';

function ring(rOuter, rInner, h, mat) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 32 });
  geo.translate(0, 0, -h / 2);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

const ghostCollider = (mass) => [{ kind: 'ball', radius: 0.02, ghost: true, massOverride: mass, pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];

export const Bearing = {
  label: 'Подшипник',
  isJoint: true,
  create({ pos, quat, base, moving, size = 0.07 }) {
    return { type: 'bearing', pos, quat, base, moving, size, brake: 400, friction: 0.05 };
  },
  mesh(p) {
    const g = new THREE.Group();
    const r = p.size / 2;
    g.add(ring(r, r * 0.62, p.size * 0.42, componentMaterial('darkSteel')));
    g.add(ring(r * 0.55, r * 0.32, p.size * 0.46, componentMaterial('chrome')));
    // balls
    const ballGeo = new THREE.SphereGeometry(r * 0.09, 10, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = new THREE.Mesh(ballGeo, componentMaterial('chrome'));
      b.position.set(Math.cos(a) * r * 0.585, 0, Math.sin(a) * r * 0.585);
      g.add(b);
    }
    const accent = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, 0.002, 6, 40), componentMaterial('accentGlow'));
    accent.rotation.x = Math.PI / 2;
    g.add(accent);
    return g;
  },
  snapPoints() { return [new THREE.Vector3()]; },
  mass() { return 0.6; },
  colliders() { return ghostCollider(0.6); },
  fields() {
    return [
      F.number('size', 'Диаметр', 0.02, 0.4, 0.005, 'м'),
      F.number('brake', 'Тормозной момент', 0, 5000, 10, 'Н·м'),
      F.number('friction', 'Трение', 0, 5, 0.01, 'Н·м·с'),
    ];
  },
};

export const Hinge = {
  label: 'Шарнир',
  isJoint: true,
  create({ pos, quat, base, moving }) {
    return { type: 'hinge', pos, quat, base, moving, maxAngle: 35, stiffness: 9000, damping: 400, size: 0.06 };
  },
  mesh(p) {
    const g = new THREE.Group();
    const s = p.size;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.12, s * 1.5, 16), componentMaterial('chrome'));
    g.add(pin);
    for (let i = -1; i <= 1; i += 2) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.3, s * 0.4, 20), componentMaterial(i < 0 ? 'darkSteel' : 'yellow'));
      k.position.y = i * s * 0.3;
      g.add(k);
    }
    const cap = new THREE.Mesh(new THREE.TorusGeometry(s * 0.32, 0.002, 6, 32), componentMaterial('accentGlow'));
    cap.rotation.x = Math.PI / 2;
    g.add(cap);
    return g;
  },
  snapPoints() { return [new THREE.Vector3()]; },
  mass() { return 1.2; },
  colliders() { return ghostCollider(1.2); },
  fields() {
    return [
      F.number('maxAngle', 'Макс. угол', 0, 180, 1, '°'),
      F.number('stiffness', 'Сила сервопривода', 0, 200000, 100),
      F.number('damping', 'Демпфирование', 0, 20000, 10),
      F.number('size', 'Размер', 0.02, 0.3, 0.005, 'м'),
    ];
  },
};

export const Spring = {
  label: 'Пружина-амортизатор',
  isJoint: true,
  create({ pos, quat, base, moving }) {
    return { type: 'spring', pos, quat, base, moving, travel: 0.08, stiffness: 25000, damping: 1500, length: 0.25 };
  },
  mesh(p) {
    const g = new THREE.Group();
    const L = p.length, r = 0.035;
    const pts = [];
    const turns = 7;
    for (let i = 0; i <= turns * 24; i++) {
      const t = i / (turns * 24);
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -L / 2 + t * L, Math.sin(a) * r));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.005, 6), componentMaterial('spring'));
    g.add(coil);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, L * 0.6, 16), componentMaterial('darkSteel'));
    body.position.y = -L * 0.15;
    g.add(body);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, L * 0.6, 12), componentMaterial('chrome'));
    rod.position.y = L * 0.25;
    g.add(rod);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(r * 0.4, 0.006, 8, 16), componentMaterial('chrome'));
      eye.position.y = s * L / 2;
      g.add(eye);
    }
    return g;
  },
  snapPoints(p) { return [new THREE.Vector3(), new THREE.Vector3(0, p.length / 2, 0), new THREE.Vector3(0, -p.length / 2, 0)]; },
  mass() { return 2.5; },
  colliders() { return ghostCollider(2.5); },
  fields() {
    return [
      F.number('travel', 'Ход', 0.005, 0.5, 0.005, 'м'),
      F.number('stiffness', 'Жёсткость', 100, 500000, 100, 'Н/м'),
      F.number('damping', 'Демпфер', 0, 50000, 10, 'Н·с/м'),
      F.number('length', 'Длина (визуал)', 0.05, 1, 0.01, 'м'),
    ];
  },
};
