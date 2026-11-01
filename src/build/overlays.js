// Small helpers for preview geometry in the editor overlay.
import * as THREE from 'three';
import { buildPartObject } from '../parts/PartFactory.js';
import { ghostMaterial, ghostBadMaterial } from '../render/Materials.js';

export function ghostOf(part, bad = false) {
  const obj = buildPartObject({ ...part, id: -1 });
  obj.traverse((o) => {
    if (o.isMesh) { o.material = bad ? ghostBadMaterial : ghostMaterial; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 10; }
    o.userData.partId = undefined;
  });
  return obj;
}

export function polyline(points, color = 0x39d0ff, closed = false, dashed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.03, depthTest: false, transparent: true })
    : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 20;
  return line;
}

export function dot(p, color = 0xffd23f, size = 0.025) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  m.position.copy(p);
  m.renderOrder = 30;
  return m;
}

export function arrow(origin, dir, length = 0.4, color = 0xffd23f) {
  const a = new THREE.ArrowHelper(dir.clone().normalize(), origin, length, color, length * 0.25, length * 0.12);
  a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 25; });
  return a;
}

export function label(text, p, color = '#e9f6ff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '600 44px JetBrains Mono, monospace';
  const w = ctx.measureText(text).width + 30;
  c.width = w; c.height = 64;
  ctx.font = '600 44px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(10,16,24,0.82)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 64, 14); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, 15, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(w / 64 * 0.09, 0.09, 1);
  s.position.copy(p);
  s.renderOrder = 40;
  s.material.sizeAttenuation = false;
  s.scale.set(w / 64 * 0.035, 0.035, 1);
  s.center.set(0.5, -0.4);
  return s;
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.map && o.isSprite) o.material.map.dispose();
  });
  g.clear();
}
