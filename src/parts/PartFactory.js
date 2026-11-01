// Creates render objects for parts and offers world-space helpers.
import * as THREE from 'three';
import { typeOf } from './registry.js';
import { V, Q } from '../core/math.js';
import { shadow } from './common.js';

export function partMatrix(part) {
  return new THREE.Matrix4().compose(V(part.pos), Q(part.quat), new THREE.Vector3(1, 1, 1));
}

export function buildPartObject(part) {
  const T = typeOf(part);
  const root = new THREE.Group();
  const m = T.mesh(part);
  root.add(m);
  root.position.copy(V(part.pos));
  root.quaternion.copy(Q(part.quat));
  root.userData.partId = part.id;
  root.traverse((o) => { o.userData.partId = part.id; });
  shadow(root);
  return root;
}

export function worldSnapPoints(part) {
  const T = typeOf(part);
  const M = partMatrix(part);
  return T.snapPoints(part).map((p) => p.applyMatrix4(M));
}

export function worldAxisLine(part) {
  const T = typeOf(part);
  if (!T.axisLine) return null;
  const { origin, dir } = T.axisLine(part);
  const q = Q(part.quat);
  return { origin: origin.applyMatrix4(partMatrix(part)), dir: dir.applyQuaternion(q).normalize() };
}

export function localToWorld(part, v) { return v.clone().applyMatrix4(partMatrix(part)); }
