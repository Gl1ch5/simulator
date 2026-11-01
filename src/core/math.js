import * as THREE from 'three';

export const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const A = (v) => [round6(v.x), round6(v.y), round6(v.z)];
export const Q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
export const QA = (q) => [q.x, q.y, q.z, q.w];
export const round6 = (x) => Math.round(x * 1e6) / 1e6;

export const AXES = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

/** Quaternion rotating local +Y onto `dir`. */
export function quatYTo(dir) {
  return new THREE.Quaternion().setFromUnitVectors(AXES.Y, dir.clone().normalize());
}
/** Quaternion rotating local +X onto `dir`, keeping "up" as stable as possible. */
export function quatXTo(dir) {
  const x = dir.clone().normalize();
  let up = Math.abs(x.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
/** Quaternion whose local Z is `normal` and local X is `u` (u must be ⟂ normal). */
export function quatFromBasis(u, normal) {
  const z = normal.clone().normalize();
  const x = u.clone().sub(z.clone().multiplyScalar(u.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
/** Pick a tangent vector for a plane normal, preferring world axes. */
export function tangentFor(normal) {
  const n = normal.clone().normalize();
  const cands = [AXES.X, AXES.Z, AXES.Y];
  for (const c of cands) if (Math.abs(n.dot(c)) < 0.5) return c.clone().sub(n.clone().multiplyScalar(c.dot(n))).normalize();
  return new THREE.Vector3(1, 0, 0);
}

export function snapScalar(x, step) { return Math.round(x / step) * step; }
export function snapVec(v, step) {
  return new THREE.Vector3(snapScalar(v.x, step), snapScalar(v.y, step), snapScalar(v.z, step));
}
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Closest point on the infinite line (p0, dir) to point p. */
export function closestOnLine(p0, dir, p) {
  const d = dir.clone().normalize();
  return p0.clone().add(d.multiplyScalar(p.clone().sub(p0).dot(d)));
}

/** Snap a direction to the nearest world axis if it's close enough. */
export function snapAxis(dir) {
  const d = dir.clone().normalize();
  let best = null, bd = 0;
  for (const k of ['X', 'Y', 'Z']) {
    const dot = d.dot(AXES[k]);
    if (Math.abs(dot) > bd) { bd = Math.abs(dot); best = AXES[k].clone().multiplyScalar(Math.sign(dot)); }
  }
  return bd > 0.999 ? best : d;
}

export function fmt(x, digits = 2) { return Number(x).toFixed(digits); }
