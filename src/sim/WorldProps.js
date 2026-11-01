// Test-track furniture: ramps, bumps, cones and crates.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLLISION } from '../core/config.js';

const PROPS = [];
// ramps (static) — x, z, width, length, height, yaw
const ramps = [
  [0, -22, 4, 6, 0.9, 0],
  [14, -34, 5, 8, 1.6, 0],
  [-18, -16, 3, 5, 0.5, Math.PI / 2],
];
for (const [x, z, w, l, h, yaw] of ramps) PROPS.push({ kind: 'ramp', x, z, w, l, h, yaw });
// speed bumps
for (let i = 0; i < 5; i++) PROPS.push({ kind: 'bump', x: -10, z: -8 - i * 3, w: 4, r: 0.08 + i * 0.02 });
// slalom cones
for (let i = 0; i < 8; i++) PROPS.push({ kind: 'cone', x: 10 + (i % 2) * 1.2, z: 6 - i * 4 });
// crate pyramid
for (let row = 0; row < 4; row++) {
  for (let i = 0; i <= 3 - row; i++) PROPS.push({ kind: 'crate', x: -14 + i * 0.62 + row * 0.31, y: 0.3 + row * 0.6, z: 12, s: 0.6 });
}

function rampGeometry(w, l, h) {
  const s2 = new THREE.Shape();
  s2.moveTo(-l / 2, 0); s2.lineTo(l / 2, h); s2.lineTo(l / 2 + 0.8, h); s2.lineTo(l / 2 + 0.8, 0); s2.closePath();
  const geo = new THREE.ExtrudeGeometry(s2, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  return geo;
}

export class WorldProps {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.8, metalness: 0.1 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf2b417, roughness: 0.5 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.5 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb0814a, roughness: 0.75 });
    for (const p of PROPS) {
      let obj;
      if (p.kind === 'ramp') {
        obj = new THREE.Group();
        const m = new THREE.Mesh(rampGeometry(p.w, p.l, p.h), rampMat);
        obj.add(m);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, p.w), stripeMat);
        edge.position.set(p.l / 2 + 0.05, p.h + 0.01, 0);
        obj.add(edge);
        obj.position.set(p.x, 0, p.z);
        obj.rotation.y = p.yaw + Math.PI / 2;
      } else if (p.kind === 'bump') {
        obj = new THREE.Mesh(new THREE.CapsuleGeometry(p.r * 2, p.w, 8, 24), stripeMat);
        obj.rotation.z = Math.PI / 2;
        obj.position.set(p.x, 0, p.z);
      } else if (p.kind === 'cone') {
        obj = new THREE.Group();
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 20), coneMat);
        c.position.y = 0.3;
        obj.add(c);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.08, 20), whiteMat);
        band.position.y = 0.34; obj.add(band);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.4), coneMat);
        base.position.y = 0.015; obj.add(base);
        obj.position.set(p.x, 0, p.z);
      } else if (p.kind === 'crate') {
        obj = new THREE.Mesh(new RoundedBoxGeometry(p.s, p.s, p.s, 2, 0.02), crateMat);
        obj.position.set(p.x, p.y, p.z);
      }
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(obj);
      this.items.push({ def: p, obj, home: { pos: obj.position.clone(), quat: obj.quaternion.clone() } });
    }
  }

  createPhysics(world, R) {
    for (const it of this.items) {
      const p = it.def;
      const groups = COLLISION.WORLD;
      if (p.kind === 'ramp') {
        const b = world.createRigidBody(R.RigidBodyDesc.fixed());
        // triangular prism hull in world space
        const geo = rampGeometry(p.w, p.l, p.h);
        it.obj.updateMatrixWorld(true);
        const pos = geo.attributes.position, v = new THREE.Vector3(), pts = [];
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(it.obj.matrixWorld); pts.push(v.x, v.y, v.z); }
        world.createCollider(R.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(1).setCollisionGroups(groups), b);
      } else if (p.kind === 'bump') {
        const b = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(p.x, 0, p.z));
        world.createCollider(R.ColliderDesc.capsule(p.w / 2, p.r * 2).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 })
          .setFriction(1).setCollisionGroups(groups), b);
      } else {
        const h = it.home;
        const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(h.pos.x, h.pos.y + (p.kind === 'cone' ? 0.3 : 0), h.pos.z));
        const desc = p.kind === 'cone' ? R.ColliderDesc.cone(0.3, 0.2).setMass(2.5) : R.ColliderDesc.cuboid(p.s / 2, p.s / 2, p.s / 2).setMass(12);
        world.createCollider(desc.setFriction(0.8).setCollisionGroups(groups), b);
        it.body = b;
        it.offsetY = p.kind === 'cone' ? 0.3 : 0;
      }
    }
  }

  sync() {
    for (const it of this.items) {
      if (!it.body) continue;
      const t = it.body.translation(), r = it.body.rotation();
      it.obj.quaternion.set(r.x, r.y, r.z, r.w);
      it.obj.position.set(t.x, t.y, t.z).add(new THREE.Vector3(0, -it.offsetY, 0).applyQuaternion(it.obj.quaternion));
    }
  }

  reset() {
    for (const it of this.items) {
      it.obj.position.copy(it.home.pos);
      it.obj.quaternion.copy(it.home.quat);
      it.body = null;
    }
  }
}
