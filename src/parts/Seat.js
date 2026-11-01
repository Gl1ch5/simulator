// Driver seat with steering wheel & pedals: the control hub. Forward = local -Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { componentMaterial } from '../render/Materials.js';
import { F } from './common.js';

export const CHANNELS = { throttle: 'Газ (W/S)', steer: 'Руль (A/D)', brake: 'Тормоз (Пробел)' };

export const Seat = {
  label: 'Сиденье + пульт',
  create({ pos, quat, base }) {
    return { type: 'seat', pos, quat, base, wires: [], steerSpeed: 2.5 };
  },
  mesh() {
    const g = new THREE.Group();
    const mat = componentMaterial('seat');
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.08, 0.42, 3, 0.03), mat);
    cushion.position.y = 0.04;
    g.add(cushion);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.5, 0.08, 3, 0.03), mat);
    back.position.set(0, 0.3, 0.2);
    back.rotation.x = -0.15;
    g.add(back);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.085), componentMaterial('redGlow'));
    stripe.position.set(0, 0.3, 0.2); stripe.rotation.x = -0.15;
    stripe.scale.set(1, 0.98, 1.01);
    g.add(stripe);
    // steering column + wheel
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 10), componentMaterial('darkSteel'));
    col.position.set(0, 0.25, -0.36); col.rotation.x = -0.6;
    g.add(col);
    const wheel = new THREE.Group();
    wheel.name = 'steeringWheel';
    wheel.position.set(0, 0.43, -0.25);
    wheel.rotation.x = -0.6 - Math.PI / 2 + Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 10, 36), componentMaterial('seat'));
    rim.rotation.x = Math.PI / 2 - 0.6;
    wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), componentMaterial('yellow'));
    hub.rotation.x = -0.6;
    wheel.add(hub);
    g.add(wheel);
    // pedals
    for (const [x, kind] of [[-0.07, 'redGlow'], [0.07, 'accentGlow']]) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.015), componentMaterial(kind));
      pedal.position.set(x, 0.06, -0.5); pedal.rotation.x = -0.4;
      g.add(pedal);
    }
    // forward arrow
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 3), componentMaterial('accentGlow'));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.01, -0.62);
    g.add(arrow);
    return g;
  },
  snapPoints() { return [new THREE.Vector3()]; },
  mass() { return 15; },
  colliders() {
    return [{ kind: 'cuboid', hx: 0.21, hy: 0.05, hz: 0.21, massOverride: 15 + 75, pos: new THREE.Vector3(0, 0.05, 0), quat: new THREE.Quaternion() }];
  },
  fields() {
    return [F.number('steerSpeed', 'Скорость руля', 0.3, 10, 0.1), F.info('Провода', (p) => `${p.wires.length} подключено`)];
  },
};
