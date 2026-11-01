// Plate / extruded prism. Polygon lives in local XY, extruded along local +Z by `depth`
// (negative depth extrudes towards -Z). Circles become exact cylinders in physics.
import * as THREE from 'three';
import { visualMaterial, componentMaterial } from '../render/Materials.js';
import { getMaterial } from '../model/materials.js';
import { shapeOutline, isConvex, triangulate, centroid, polygonArea } from '../geometry/shape2d.js';
import { treadTexture } from '../render/textures.js';
import { F, MAT_FIELD } from './common.js';

export function zRange(p) {
  const a = p.zOff || 0, b = a + p.depth;
  return a <= b ? [a, b] : [b, a];
}

function tireMesh(p) {
  // Rounded tyre profile revolved around the wheel axis + steel hub.
  const r = p.circle.r, w = Math.abs(p.depth);
  const [z0] = zRange(p);
  const round = Math.min(w * 0.35, r * 0.25);
  const prof = [];
  const inner = r * 0.62;
  prof.push(new THREE.Vector2(inner, 0));
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - round + Math.cos(a) * round, round + Math.sin(a) * round));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - round + Math.cos(a) * round, w - round + Math.sin(a) * round));
  }
  prof.push(new THREE.Vector2(inner, w));
  const geo = new THREE.LatheGeometry(prof, 48);
  const tread = treadTexture().clone();
  tread.needsUpdate = true;
  tread.repeat.set(Math.max(4, Math.round(r * 40)), 1);
  const tmat = visualMaterial(p.material).clone();
  tmat.bumpMap = tread; tmat.bumpScale = 2.0;
  const tire = new THREE.Mesh(geo, tmat);
  tire.rotation.x = Math.PI / 2; // lathe axis Y -> Z
  tire.position.z = z0;
  const g = new THREE.Group();
  g.add(tire);
  // hub / rim
  const rimGeo = new THREE.CylinderGeometry(inner * 1.02, inner * 1.02, w * 0.8, 32, 1, true);
  const rim = new THREE.Mesh(rimGeo, componentMaterial('chrome'));
  rim.rotation.x = Math.PI / 2; rim.position.z = z0 + w / 2;
  g.add(rim);
  const discGeo = new THREE.CylinderGeometry(inner, inner, w * 0.12, 32);
  const disc = new THREE.Mesh(discGeo, componentMaterial('darkSteel'));
  disc.rotation.x = Math.PI / 2; disc.position.z = z0 + w / 2;
  g.add(disc);
  // spokes
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(inner * 0.95, inner * 0.16, w * 0.2), componentMaterial('chrome'));
    s.position.set(0, 0, z0 + w / 2);
    s.rotation.z = (i / 5) * Math.PI * 2;
    s.geometry.translate(inner * 0.45, 0, 0);
    g.add(s);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(inner * 0.22, inner * 0.22, w * 0.5, 16), componentMaterial('chrome'));
  cap.rotation.x = Math.PI / 2; cap.position.z = z0 + w / 2;
  g.add(cap);
  return g;
}

export const Shape = {
  label: 'Пластина / тело',
  create({ pos, quat, points = null, circle = null, round = 0, depth, material = 'steel' }) {
    return { type: 'shape', material, pos, quat, points, circle, round, depth };
  },
  isTire(p) { return !!p.circle && p.material === 'rubber' && Math.abs(p.depth) >= 0.03; },
  mesh(p) {
    if (Shape.isTire(p)) return tireMesh(p);
    const outline = shapeOutline(p);
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const d = Math.abs(p.depth);
    const bevel = Math.min(0.0025, d * 0.2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(d - bevel * 2, 0.0005),
      bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1,
      curveSegments: 1,
    });
    geo.translate(0, 0, bevel + zRange(p)[0]);
    // world-scale UVs for textures
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.0, uv.getY(i) * 1.0);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, visualMaterial(p.material));
  },
  outline(p) { return shapeOutline(p); },
  snapPoints(p) {
    const pts = [];
    const [z0, z1] = zRange(p);
    if (p.circle) {
      pts.push(new THREE.Vector3(0, 0, z0), new THREE.Vector3(0, 0, z1), new THREE.Vector3(0, 0, (z0 + z1) / 2));
      const segs = Math.min(p.circle.segments, 8);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * p.circle.r, Math.sin(a) * p.circle.r, z0));
        pts.push(new THREE.Vector3(Math.cos(a) * p.circle.r, Math.sin(a) * p.circle.r, z1));
      }
      return pts;
    }
    for (const [x, y] of p.points) {
      pts.push(new THREE.Vector3(x, y, z0));
      if (Math.abs(z1 - z0) > 0.015) pts.push(new THREE.Vector3(x, y, z1));
    }
    const c = centroid(p.points);
    pts.push(new THREE.Vector3(c[0], c[1], z0), new THREE.Vector3(c[0], c[1], z1));
    return pts;
  },
  axisLine(p) {
    const c = p.circle ? [0, 0] : centroid(p.points);
    const [z0, z1] = zRange(p);
    return { origin: new THREE.Vector3(c[0], c[1], (z0 + z1) / 2), dir: new THREE.Vector3(0, 0, 1) };
  },
  mass(p) {
    const area = polygonArea(shapeOutline(p));
    const solid = area * Math.abs(p.depth) * getMaterial(p.material).density;
    // tyres are pneumatic: rubber shell + air, roughly 30% of a solid rubber disc
    return Shape.isTire(p) ? solid * 0.3 : solid;
  },
  colliders(p) {
    const [z0, z1] = zRange(p);
    const h = Math.max((z1 - z0) / 2, 0.001);
    if (p.circle) {
      return [{ kind: 'cylinder', halfHeight: h, radius: p.circle.r,
        roundness: Shape.isTire(p) ? Math.min(h * 0.4, p.circle.r * 0.1) : 0,
        pos: new THREE.Vector3(0, 0, (z0 + z1) / 2),
        quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) }];
    }
    const outline = shapeOutline(p);
    const hull = (poly) => {
      const arr = [];
      for (const [x, y] of poly) arr.push(x, y, z0, x, y, z1);
      return { kind: 'hull', points: new Float32Array(arr), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), area: polygonArea(poly) };
    };
    if (isConvex(outline)) return [hull(outline)];
    return triangulate(outline).map((tri) => hull(tri.map((i) => outline[i])));
  },
  fields(p) {
    const f = [MAT_FIELD, F.number('depth', 'Толщина / вылет', -5, 5, 0.005, 'м')];
    if (p.circle) {
      f.push(F.number('circle.r', 'Радиус', 0.01, 5, 0.005, 'м'));
      f.push(F.number('circle.segments', 'Сторон', 3, 64, 1));
    } else {
      f.push(F.number('round', 'Скругление углов', 0, 2, 0.005, 'м'));
    }
    return f;
  },
};
