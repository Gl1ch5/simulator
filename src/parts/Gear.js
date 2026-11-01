// Spur gear mounted on a shaft/rotating part or on a motor shaft. Axis = local +Y.
import * as THREE from 'three';
import { visualMaterial, componentMaterial } from '../render/Materials.js';
import { getMaterial } from '../model/materials.js';
import { gearShape, gearRadius } from '../geometry/gear.js';
import { F, MAT_FIELD } from './common.js';

export const Gear = {
  label: 'Шестерня',
  create({ pos, quat, teeth = 20, module = 0.006, width = 0.03, mount, material = 'steel' }) {
    return { type: 'gear', pos, quat, teeth, module, width, mount, material };
  },
  radius(p) { return gearRadius(p.teeth, p.module); },
  mesh(p) {
    const g = new THREE.Group();
    const shape = gearShape(p.teeth, p.module, Math.min(0.012, gearRadius(p.teeth, p.module) * 0.3));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: p.width, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0008, bevelOffset: -0.0008, bevelSegments: 1, curveSegments: 12,
    });
    geo.translate(0, 0, -p.width / 2);
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, visualMaterial(p.material)));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, p.width * 1.4, 20), componentMaterial('brass'));
    g.add(hub);
    return g;
  },
  snapPoints() { return [new THREE.Vector3()]; },
  axisLine() { return { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0) }; },
  mass(p) { const r = gearRadius(p.teeth, p.module); return Math.PI * r * r * p.width * getMaterial(p.material).density * 0.75; },
  colliders(p) {
    // Gears never collide (meshing is solved by the drivetrain), but carry mass.
    return [{ kind: 'cylinder', halfHeight: p.width / 2, radius: gearRadius(p.teeth, p.module), ghost: true,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
  },
  fields(p) {
    return [
      MAT_FIELD,
      F.number('teeth', 'Зубьев', 6, 120, 1),
      F.number('module', 'Модуль', 0.002, 0.02, 0.001, 'м'),
      F.number('width', 'Ширина', 0.005, 0.15, 0.005, 'м'),
      F.info('Делительный Ø', () => (gearRadius(p.teeth, p.module) * 2).toFixed(3) + ' м'),
    ];
  },
};
