// Active slice of the 3D lattice: an axis-aligned plane through the focus point.
// In "auto" mode the slice orientation follows the camera (top view -> floor, side view -> wall).
import * as THREE from 'three';
import { snapScalar } from '../core/math.js';
import { bus } from '../core/EventBus.js';

export const PLANES = {
  XZ: { normal: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), label: 'Пол (XZ)', axis: 'Y' },
  XY: { normal: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), label: 'Фронт (XY)', axis: 'Z' },
  YZ: { normal: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), label: 'Бок (YZ)', axis: 'X' },
};

const vert = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const frag = /* glsl */`
uniform float uStep;
uniform vec3 uCursor;
uniform vec3 uU;
uniform vec3 uV;
uniform vec3 uN;
uniform vec3 uColor;
uniform vec3 uMajor;
uniform float uRadius;
varying vec3 vWorld;
float lineAA(float coord, float width) {
  float fw = fwidth(coord);
  float d = abs(fract(coord - 0.5) - 0.5) / max(fw, 1e-5);
  return 1.0 - clamp(d / width, 0.0, 1.0);
}
void main() {
  vec2 p = vec2(dot(vWorld, uU), dot(vWorld, uV));
  vec2 c = vec2(dot(uCursor, uU), dot(uCursor, uV));
  vec2 g = p / uStep;
  // lines that would be thinner than a pixel apart (grazing angles / far away) fade out instead of merging into a fill
  vec2 fwG = fwidth(g);
  float minorVis = 1.0 - smoothstep(0.25, 0.6, max(fwG.x, fwG.y));
  float majorVis = 1.0 - smoothstep(2.5, 6.0, max(fwG.x, fwG.y));
  float minor = max(lineAA(g.x, 1.0), lineAA(g.y, 1.0)) * minorVis;
  float major = max(lineAA(g.x / 10.0, 1.3), lineAA(g.y / 10.0, 1.3)) * majorVis;
  float d = length(p - c);
  float near = 1.0 - smoothstep(uRadius * 0.2, uRadius, d);
  float mid = 1.0 - smoothstep(uRadius, uRadius * 4.0, d);
  float far = 1.0 - smoothstep(6.0, 60.0, length(p));
  // node dots at intersections close to the cursor
  vec2 cell = abs(fract(g - 0.5) - 0.5) * uStep;
  float dotR = uStep * 0.06;
  float node = (1.0 - smoothstep(dotR, dotR * 1.8, length(cell))) * near * minorVis;
  float a = minor * (0.08 * mid + 0.5 * near) + major * (0.28 * max(mid, far * 0.8) + 0.4 * near) + node * 0.9;
  // soft fill of the slice near the cursor so it reads as a surface
  a += 0.05 * near * minorVis;
  // world axes on the slice
  float ax = (1.0 - clamp(abs(p.y) / max(fwidth(p.y), 1e-5) / 1.6, 0.0, 1.0)) * (1.0 - smoothstep(0.05, 0.3, fwidth(p.y)));
  float ay = (1.0 - clamp(abs(p.x) / max(fwidth(p.x), 1e-5) / 1.6, 0.0, 1.0)) * (1.0 - smoothstep(0.05, 0.3, fwidth(p.x)));
  vec3 col = mix(uColor, uMajor, clamp(major + node, 0.0, 1.0));
  vec3 axU = abs(uU.x) > 0.5 ? vec3(1.0, 0.33, 0.33) : abs(uU.y) > 0.5 ? vec3(0.4, 1.0, 0.5) : vec3(0.35, 0.6, 1.0);
  vec3 axV = abs(uV.x) > 0.5 ? vec3(1.0, 0.33, 0.33) : abs(uV.y) > 0.5 ? vec3(0.4, 1.0, 0.5) : vec3(0.35, 0.6, 1.0);
  col = mix(col, axU, ax);
  col = mix(col, axV, ay);
  a = max(a, max(ax, ay) * 0.85 * max(far, mid));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

export class WorkPlane {
  constructor(scene) {
    this.mode = 'auto';         // 'auto' | 'XZ' | 'XY' | 'YZ'
    this.orientation = 'XZ';    // effective orientation
    this.focus = new THREE.Vector3();
    this.step = 0.1;
    this.uniforms = {
      uStep: { value: this.step },
      uCursor: { value: new THREE.Vector3() },
      uU: { value: PLANES.XZ.u.clone() },
      uV: { value: PLANES.XZ.v.clone() },
      uN: { value: PLANES.XZ.normal.clone() },
      uColor: { value: new THREE.Color(0x7fcfff) },
      uMajor: { value: new THREE.Color(0x39d0ff) },
      uRadius: { value: 1.0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat);
    this.mesh.renderOrder = 5;
    this.mesh.name = 'workplane';
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.plane = new THREE.Plane();
    this.cursor = new THREE.Vector3();
    this.update();
  }

  get def() { return PLANES[this.orientation]; }
  get normal() { return this.def.normal; }
  get offset() { return this.focus.dot(this.normal); }

  setMode(m) {
    this.mode = m;
    if (m !== 'auto') this.orientation = m;
    this.update();
  }
  /** Backwards-compatible: picking a fixed orientation switches off auto mode. */
  setOrientation(o) { this.setMode(o); }
  setStep(s) { this.step = s; this.update(); }
  nudge(dir) {
    const n = this.normal;
    const off = snapScalar(this.offset + dir * this.step, this.step);
    this.focus.addScaledVector(n, off - this.offset);
    this.update();
  }
  setFocus(p) { this.focus.copy(p); this.update(); }
  setOffsetFromPoint(p) { this.setFocus(p); }
  setVisible(v) { this.mesh.visible = v; }

  /** Auto mode: choose the slice most facing the camera, biased towards the floor. */
  autoOrient(camera) {
    if (this.mode !== 'auto') return;
    const d = camera.getWorldDirection(new THREE.Vector3());
    const score = { XZ: Math.abs(d.y) * 2.6, XY: Math.abs(d.z), YZ: Math.abs(d.x) };
    let best = this.orientation;
    for (const k of Object.keys(score)) if (score[k] > score[best] + 0.12) best = k;
    if (best !== this.orientation) { this.orientation = best; this.update(); }
  }

  update() {
    const d = this.def;
    this.plane.setFromNormalAndCoplanarPoint(d.normal, this.focus);
    // PlaneGeometry lies in XY (normal +Z); the shader works in world space, so only the normal matters
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normal);
    this.uniforms.uStep.value = this.step;
    this.uniforms.uU.value.copy(d.u);
    this.uniforms.uV.value.copy(d.v);
    this.uniforms.uN.value.copy(d.normal);
    this.uniforms.uRadius.value = THREE.MathUtils.clamp(this.step * 8, 0.5, 8);
    this.place();
    bus.emit('plane:changed', this);
  }

  /** Keep the (finite) slice mesh centred near the cursor so the grid never "ends". */
  place() {
    const d = this.def;
    const c = this.cursor.clone().projectOnPlane(d.normal);
    const snap = 10;
    const lift = this.orientation === 'XZ' && Math.abs(this.offset) < 1e-6 ? 0.003 : 0;
    this.mesh.position.set(Math.round(c.x / snap) * snap, Math.round(c.y / snap) * snap, Math.round(c.z / snap) * snap)
      .addScaledVector(d.normal, this.offset + lift);
  }

  setCursor(p) {
    this.cursor.copy(p);
    this.uniforms.uCursor.value.copy(p);
    this.place();
  }

  snapOnPlane(p) {
    const d = this.def;
    const u = snapScalar(p.dot(d.u), this.step), v = snapScalar(p.dot(d.v), this.step);
    return d.u.clone().multiplyScalar(u).add(d.v.clone().multiplyScalar(v)).add(d.normal.clone().multiplyScalar(this.offset));
  }
}
