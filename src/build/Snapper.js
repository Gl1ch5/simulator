// Resolves the 3D point under the mouse: vertex snap > part surface > work plane.
import * as THREE from 'three';
import { worldSnapPoints } from '../parts/PartFactory.js';
import { snapScalar } from '../core/math.js';
import { CONFIG } from '../core/config.js';

export class Snapper {
  constructor(build) {
    this.build = build;
    this.raycaster = new THREE.Raycaster();
    this.points = []; // { p: Vector3, partId }
    this.dirty = true;
  }

  invalidate() { this.dirty = true; }

  refresh() {
    if (!this.dirty) return;
    this.points = [];
    for (const part of this.build.blueprint.all()) {
      for (const p of worldSnapPoints(part)) this.points.push({ p, partId: part.id });
    }
    this.dirty = false;
  }

  ray(ndc) {
    this.raycaster.setFromCamera(ndc, this.build.camera);
    return this.raycaster.ray;
  }

  /** Raycast parts; returns { point, normal, partId, object } or null. */
  pickPart(ndc, filter = null) {
    this.raycaster.setFromCamera(ndc, this.build.camera);
    const hits = this.raycaster.intersectObjects(this.build.partRoot.children, true);
    for (const h of hits) {
      const id = h.object.userData.partId;
      if (id == null) continue;
      if (filter && !filter(this.build.blueprint.get(id))) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize() : new THREE.Vector3(0, 1, 0);
      return { point: h.point.clone(), normal: n, partId: id, object: h.object };
    }
    return null;
  }

  /**
   * opts: { vertices=true, surfaces=true, constrainLine: {origin, dir} | null, exclude: Set }
   */
  resolve(ndc, opts = {}) {
    this.refresh();
    const cam = this.build.camera;
    const wp = this.build.workPlane;
    const step = wp.step;
    const ray = this.ray(ndc);

    // Constrained to a line (e.g. Shift = perpendicular to the plane)
    if (opts.constrainLine) {
      const { origin, dir } = opts.constrainLine;
      const d = dir.clone().normalize();
      // closest point between ray and line
      const w0 = ray.origin.clone().sub(origin);
      const a = ray.direction.dot(ray.direction), b = ray.direction.dot(d), c = d.dot(d);
      const dd = ray.direction.dot(w0), e = d.dot(w0);
      const den = a * c - b * b;
      const t = den > 1e-8 ? (a * e - b * dd) / den : 0;
      const tt = snapScalar(t, step);
      return { point: origin.clone().addScaledVector(d, tt), partId: null, normal: wp.normal.clone(), kind: 'line' };
    }

    if (opts.vertices !== false) {
      const w = window.innerWidth, h = window.innerHeight;
      const mx = (ndc.x + 1) / 2 * w, my = (1 - ndc.y) / 2 * h;
      let best = null, bd = CONFIG.snapPixels;
      const v = new THREE.Vector3();
      for (const sp of this.points) {
        if (opts.exclude?.has(sp.partId)) continue;
        v.copy(sp.p).project(cam);
        if (v.z > 1) continue;
        const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bd) { bd = d; best = sp; }
      }
      if (best) {
        const hit = this.pickPart(ndc);
        return { point: best.p.clone(), partId: best.partId, normal: hit?.normal || wp.normal.clone(), kind: 'vertex' };
      }
    }

    if (opts.surfaces !== false) {
      const hit = this.pickPart(ndc, opts.exclude ? (p) => !opts.exclude.has(p.id) : null);
      if (hit) {
        const planeHit = ray.intersectPlane(wp.plane, new THREE.Vector3());
        const surfDist = hit.point.distanceTo(ray.origin);
        const planeDist = planeHit ? planeHit.distanceTo(ray.origin) : Infinity;
        if (surfDist <= planeDist + 1e-3 || opts.preferSurface) {
          const p = hit.point.clone();
          const s = new THREE.Vector3(snapScalar(p.x, step), snapScalar(p.y, step), snapScalar(p.z, step));
          const n = hit.normal;
          // keep the point on the face plane
          s.addScaledVector(n, -s.clone().sub(p).dot(n));
          return { point: s, partId: hit.partId, normal: n.clone(), kind: 'surface', rawPoint: p };
        }
      }
    }

    const p = ray.intersectPlane(wp.plane, new THREE.Vector3());
    if (!p) return null;
    return { point: wp.snapOnPlane(p), partId: null, normal: wp.normal.clone(), kind: 'plane' };
  }
}
