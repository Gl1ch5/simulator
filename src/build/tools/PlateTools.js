// Rectangle, polygon and circle drawing tools that create plates (shape parts).
import * as THREE from 'three';
import { Tool } from './Tool.js';
import { Shape } from '../../parts/Shape.js';
import { ghostOf, polyline, label, dot } from '../overlays.js';
import { A, QA, quatFromBasis, tangentFor } from '../../core/math.js';

/** Determine the drawing frame from the first snap (surface face or work plane). */
function frameFrom(build, snap) {
  if (snap.kind === 'surface' || (snap.kind === 'vertex' && snap.partId != null && snap.normal)) {
    const n = snap.normal.clone().normalize();
    const u = tangentFor(n);
    return { origin: snap.point.clone(), n, u, v: new THREE.Vector3().crossVectors(n, u) };
  }
  const d = build.workPlane.def;
  return { origin: snap.point.clone(), n: d.normal.clone(), u: d.u.clone(), v: d.v.clone() };
}

function project(frame, p) {
  const d = p.clone().sub(frame.origin);
  return [d.dot(frame.u), d.dot(frame.v)];
}

/** Cast the current mouse ray onto the frame plane and grid-snap within it. */
function onFrame(build, frame, ndc, snap) {
  if (snap && snap.kind === 'vertex') return snap.point.clone();
  const ray = build.snapper.ray(ndc);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(frame.n, frame.origin);
  const p = ray.intersectPlane(plane, new THREE.Vector3());
  if (!p) return null;
  const step = build.workPlane.step;
  const [u, v] = project(frame, p);
  const su = Math.round(u / step) * step, sv = Math.round(v / step) * step;
  return frame.origin.clone().addScaledVector(frame.u, su).addScaledVector(frame.v, sv);
}

function shapePart(build, frame, data) {
  const s = build.settings;
  return Shape.create({
    pos: A(frame.origin), quat: QA(quatFromBasis(frame.u, frame.n)),
    depth: s.material === 'rubber' && data.circle ? Math.max(s.plateThickness, 0.006) : s.plateThickness,
    material: s.material, round: data.circle ? 0 : s.round, ...data,
  });
}

export class RectTool extends Tool {
  constructor(b) { super(b); this.id = 'rect'; this.name = 'Прямоугольник'; this.hotkey = 'R'; }
  reset() { super.reset(); this.frame = null; this.first = null; }
  hint() { return this.frame ? 'Кликни противоположный угол' : 'Кликни первый угол на плоскости или на грани детали. <b>Скругление</b> — в панели параметров'; }
  onMove(snap, e, ndc) {
    this.clearPreview();
    if (!this.frame) return;
    const p = onFrame(this.build, this.frame, ndc, snap);
    if (!p) return;
    const [u, v] = project(this.frame, p);
    if (Math.abs(u) < 1e-4 || Math.abs(v) < 1e-4) return;
    this.preview.add(ghostOf(shapePart(this.build, this.frame, { points: [[0, 0], [u, 0], [u, v], [0, v]] })));
    this.preview.add(label(`${Math.abs(u).toFixed(2)} × ${Math.abs(v).toFixed(2)} м`, p));
  }
  onDown(snap, e, ndc) {
    if (!snap) return;
    if (!this.frame) { this.frame = frameFrom(this.build, snap); this.first = snap; return; }
    const p = onFrame(this.build, this.frame, ndc, snap);
    if (!p) return;
    const [u, v] = project(this.frame, p);
    if (Math.abs(u) < 1e-4 || Math.abs(v) < 1e-4) return;
    this.bp.commit();
    const part = this.bp.add(shapePart(this.build, this.frame, { points: [[0, 0], [u, 0], [u, v], [0, v]] }));
    this.build.autoConnect(part.id, [this.first, snap]);
    this.reset();
  }
  cancel() { if (this.frame) { this.reset(); return true; } return false; }
}

export class PolygonTool extends Tool {
  constructor(b) { super(b); this.id = 'polygon'; this.name = 'Многоугольник'; this.hotkey = 'P'; }
  reset() { super.reset(); this.frame = null; this.pts = []; this.snaps = []; }
  hint() {
    if (!this.frame) return 'Ставь вершины многоугольника кликами. Скругление углов — в параметрах';
    return `Вершин: ${this.pts.length}. Кликни по первой точке или <b>Enter</b> — замкнуть · <b>Backspace</b> — убрать точку · <b>ПКМ</b> — отмена`;
  }
  draw(cursor) {
    this.clearPreview();
    if (!this.frame) return;
    const world = this.pts.map(([u, v]) => this.frame.origin.clone().addScaledVector(this.frame.u, u).addScaledVector(this.frame.v, v));
    if (cursor) world.push(cursor);
    if (world.length >= 2) this.preview.add(polyline(world, 0x39d0ff, world.length >= 3));
    world.forEach((p, i) => this.preview.add(dot(p, i === 0 ? 0xffd23f : 0x39d0ff, 0.015)));
    if (this.pts.length >= 2 && cursor) {
      const pts = [...this.pts, project(this.frame, cursor)];
      this.preview.add(ghostOf(shapePart(this.build, this.frame, { points: pts })));
    }
  }
  nearFirst(ndc) {
    if (this.pts.length < 3) return false;
    const p0 = this.frame.origin.clone().addScaledVector(this.frame.u, this.pts[0][0]).addScaledVector(this.frame.v, this.pts[0][1]);
    const s = p0.project(this.build.camera);
    return Math.hypot((s.x - ndc.x) * window.innerWidth / 2, (s.y - ndc.y) * window.innerHeight / 2) < 14;
  }
  onMove(snap, e, ndc) {
    if (!this.frame) { this.clearPreview(); return; }
    this.draw(onFrame(this.build, this.frame, ndc, snap));
  }
  onDown(snap, e, ndc) {
    if (!snap) return;
    if (!this.frame) { this.frame = frameFrom(this.build, snap); this.pts = [[0, 0]]; this.snaps = [snap]; this.draw(); return; }
    if (this.nearFirst(ndc)) { this.finish(); return; }
    const p = onFrame(this.build, this.frame, ndc, snap);
    if (!p) return;
    const uv = project(this.frame, p);
    const last = this.pts[this.pts.length - 1];
    if (Math.hypot(uv[0] - last[0], uv[1] - last[1]) < 1e-4) return;
    this.pts.push(uv);
    this.snaps.push(snap);
    this.draw();
  }
  finish() {
    if (this.pts.length < 3) return;
    this.bp.commit();
    const part = this.bp.add(shapePart(this.build, this.frame, { points: this.pts }));
    this.build.autoConnect(part.id, this.snaps);
    this.reset();
  }
  onKey(e) {
    if (!this.frame) return false;
    if (e.code === 'Enter') { this.finish(); return true; }
    if (e.code === 'Backspace') { this.pts.pop(); this.snaps.pop(); if (!this.pts.length) this.reset(); else this.draw(); return true; }
    return false;
  }
  cancel() { if (this.frame) { this.reset(); return true; } return false; }
}

export class CircleTool extends Tool {
  constructor(b) { super(b); this.id = 'circle'; this.name = 'Круг / N-угольник'; this.hotkey = 'C'; }
  reset() { super.reset(); this.frame = null; this.centerSnap = null; }
  hint() {
    const n = this.settings.circleSegments;
    return this.frame
      ? `Кликни, чтобы задать радиус · сторон: <b>${n}</b> (<b>[ ]</b> менять)`
      : `Кликни центр круга (для колеса — рисуй на вертикальной плоскости <b>2</b>/<b>3</b>, потом вытяни инструментом <b>T</b>) · сторон: ${n}`;
  }
  radiusFrom(ndc, snap) {
    const p = onFrame(this.build, this.frame, ndc, snap);
    if (!p) return 0;
    const step = this.build.workPlane.step;
    let r = p.distanceTo(this.frame.origin);
    if (snap?.kind !== 'vertex') r = Math.max(step / 2, Math.round(r / (step / 2)) * (step / 2));
    return r;
  }
  onMove(snap, e, ndc) {
    this.clearPreview();
    if (!this.frame) return;
    const r = this.radiusFrom(ndc, snap);
    if (r < 1e-3) return;
    this.preview.add(ghostOf(shapePart(this.build, this.frame, { circle: { r, segments: this.settings.circleSegments } })));
    this.preview.add(label(`R ${r.toFixed(3)} м`, this.frame.origin.clone().addScaledVector(this.frame.u, r)));
  }
  onDown(snap, e, ndc) {
    if (!snap) return;
    if (!this.frame) { this.frame = frameFrom(this.build, snap); this.centerSnap = snap; return; }
    const r = this.radiusFrom(ndc, snap);
    if (r < 1e-3) return;
    this.bp.commit();
    const part = this.bp.add(shapePart(this.build, this.frame, { circle: { r, segments: this.settings.circleSegments } }));
    this.build.autoConnect(part.id, [this.centerSnap]);
    this.reset();
  }
  onKey(e) {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      const s = this.settings.circleSegments + (e.code === 'BracketLeft' ? -1 : 1);
      this.build.setSetting('circleSegments', Math.max(3, Math.min(64, s)));
      return true;
    }
    return false;
  }
  cancel() { if (this.frame) { this.reset(); return true; } return false; }
}
