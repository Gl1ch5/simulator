// The active construction plane: orientation (XZ / XY / YZ), offset and grid step.
// Rendered with a shader grid that fades around the cursor.
import * as THREE from 'three';
import { snapScalar } from '../core/math.js';
import { bus } from '../core/EventBus.js';

export const PLANES = {
  XZ: { normal: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), label: 'Пол (XZ)' },
  XY: { normal: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), label: 'Фронт (XY)' },
  YZ: { normal: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), label: 'Бок (YZ)' },
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
uniform vec3 uColor;
uniform vec3 uMajor;
uniform float uRadius;
varying vec3 vWorld;
float gridLine(vec2 p, float step, float width) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}
void main() {
  vec2 p = vec2(dot(vWorld, uU), dot(vWorld, uV));
  vec2 c = vec2(dot(uCursor, uU), dot(uCursor, uV));
  float minor = gridLine(p, uStep, 1.0);
  float major = gridLine(p, uStep * 10.0, 1.4);
  float d = length(p - c);
  float fade = 1.0 - smoothstep(uRadius * 0.35, uRadius, d);
  float far = 1.0 - smoothstep(4.0, 40.0, length(p));
  float a = max(minor * 0.45 * fade, major * 0.6 * max(fade, far * 0.6));
  // axes
  float ax = 1.0 - min(abs(p.y) / fwidth(p.y) / 1.5, 1.0);
  float ay = 1.0 - min(abs(p.x) / fwidth(p.x) / 1.5, 1.0);
  vec3 col = mix(uColor, uMajor, major);
  col = mix(col, vec3(1.0, 0.3, 0.3), ax);
  col = mix(col, vec3(0.3, 0.6, 1.0), ay);
  a = max(a, max(ax, ay) * 0.9 * far);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

export class WorkPlane {
  constructor(scene) {
    this.orientation = 'XZ';
    this.offset = 0;
    this.step = 0.1;
    this.uniforms = {
      uStep: { value: this.step },
      uCursor: { value: new THREE.Vector3() },
      uU: { value: PLANES.XZ.u.clone() },
      uV: { value: PLANES.XZ.v.clone() },
      uColor: { value: new THREE.Color(0x9fdcff) },
      uMajor: { value: new THREE.Color(0x39d0ff) },
      uRadius: { value: 3.0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat);
    this.mesh.renderOrder = 5;
    this.mesh.name = 'workplane';
    scene.add(this.mesh);
    this.plane = new THREE.Plane();
    this.update();
  }

  get def() { return PLANES[this.orientation]; }
  get normal() { return this.def.normal; }

  setOrientation(o) { this.orientation = o; this.update(); }
  setStep(s) { this.step = s; this.offset = snapScalar(this.offset, s); this.update(); }
  nudge(dir) { this.offset = snapScalar(this.offset + dir * this.step, this.step); this.update(); }
  setOffsetFromPoint(p) { this.offset = snapScalar(p.dot(this.normal), 0.001); this.update(); }
  setVisible(v) { this.mesh.visible = v; }

  update() {
    const d = this.def;
    this.plane.setFromNormalAndCoplanarPoint(d.normal, d.normal.clone().multiplyScalar(this.offset));
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.u, d.v, d.normal));
    this.mesh.position.copy(d.normal).multiplyScalar(this.offset + (this.orientation === 'XZ' && Math.abs(this.offset) < 1e-6 ? 0.003 : 0));
    this.uniforms.uStep.value = this.step;
    this.uniforms.uU.value.copy(d.u);
    this.uniforms.uV.value.copy(d.v);
    bus.emit('plane:changed', this);
  }

  setCursor(p) {
    this.uniforms.uCursor.value.copy(p);
    // keep the visual plane centred near the cursor so the grid never "ends"
    const d = this.def;
    const c = p.clone().sub(d.normal.clone().multiplyScalar(p.dot(d.normal)));
    const snap = 10;
    this.mesh.position.copy(d.normal).multiplyScalar(this.offset + (this.orientation === 'XZ' && Math.abs(this.offset) < 1e-6 ? 0.003 : 0))
      .add(new THREE.Vector3(Math.round(c.x / snap) * snap, Math.round(c.y / snap) * snap, Math.round(c.z / snap) * snap));
  }

  snapOnPlane(p) {
    const d = this.def;
    const u = snapScalar(p.dot(d.u), this.step), v = snapScalar(p.dot(d.v), this.step);
    return d.u.clone().multiplyScalar(u).add(d.v.clone().multiplyScalar(v)).add(d.normal.clone().multiplyScalar(this.offset));
  }
}
