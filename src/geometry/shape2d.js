// 2D polygon helpers for plates / extruded prisms.
import * as THREE from 'three';

export function circlePoints(r, segments) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function ensureCCW(pts) { return signedArea(pts) < 0 ? [...pts].reverse() : pts; }

export function isConvex(pts) {
  let sign = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

export function centroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f; cy += (y1 + y2) * f; a += f;
  }
  if (Math.abs(a) < 1e-12) {
    const s = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [s[0] / pts.length, s[1] / pts.length];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

/** Replace every corner by a circular fillet of radius r (clamped per corner). */
export function roundPolygon(pts, r, arcSeg = 6) {
  if (!r || r <= 0 || pts.length < 3) return pts;
  const P = ensureCCW(pts);
  const n = P.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = new THREE.Vector2(...P[(i - 1 + n) % n]);
    const cur = new THREE.Vector2(...P[i]);
    const next = new THREE.Vector2(...P[(i + 1) % n]);
    const d1 = prev.clone().sub(cur), d2 = next.clone().sub(cur);
    const l1 = d1.length(), l2 = d2.length();
    d1.normalize(); d2.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
    if (ang < 1e-3 || Math.abs(ang - Math.PI) < 1e-3) { out.push([cur.x, cur.y]); continue; }
    let t = r / Math.tan(ang / 2);
    const tMax = Math.min(l1, l2) * 0.5;
    let rr = r;
    if (t > tMax) { t = tMax; rr = t * Math.tan(ang / 2); }
    const p1 = cur.clone().add(d1.clone().multiplyScalar(t));
    const p2 = cur.clone().add(d2.clone().multiplyScalar(t));
    const bis = d1.clone().add(d2).normalize();
    const center = cur.clone().add(bis.multiplyScalar(rr / Math.sin(ang / 2)));
    let a1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    let a2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    // choose the short arc
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= arcSeg; k++) {
      const a = a1 + (da * k) / arcSeg;
      out.push([center.x + Math.cos(a) * rr, center.y + Math.sin(a) * rr]);
    }
  }
  return out;
}

/** Final outline used for mesh + physics of a shape part. */
export function shapeOutline(shape) {
  if (shape.circle) return circlePoints(shape.circle.r, shape.circle.segments);
  const base = ensureCCW(shape.points);
  return shape.round > 0 ? roundPolygon(base, shape.round, 6) : base;
}

export function triangulate(pts) {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  return THREE.ShapeUtils.triangulateShape(contour, []);
}

export function polygonArea(pts) { return Math.abs(signedArea(pts)); }
