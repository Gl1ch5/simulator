// Volumetric 3D grid: glowing cube edges + nodes around the cursor that fade with distance.
// The lattice block follows the cursor so the grid feels infinite in every direction.
import * as THREE from 'three';

const R = 10; // half-size of the lattice block in cells

const lineVert = /* glsl */`
uniform vec3 uCursor;
uniform float uRadius;
varying float vFade;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  float d = distance(w.xyz, uCursor);
  vFade = 1.0 - smoothstep(uRadius * 0.15, uRadius, d);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const lineFrag = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uCursor;
uniform float uRadius;
varying float vFade;
varying vec3 vWorld;
void main() {
  float d = distance(vWorld, uCursor);
  float f = 1.0 - smoothstep(uRadius * 0.1, uRadius, d);
  float a = f * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const pointVert = /* glsl */`
uniform vec3 uCursor;
uniform float uRadius;
uniform float uSize;
varying float vFade;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float d = distance(w.xyz, uCursor);
  vFade = 1.0 - smoothstep(uRadius * 0.1, uRadius * 0.8, d);
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.35 + 0.65 * vFade);
}`;
const pointFrag = /* glsl */`
uniform vec3 uColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float core = 1.0 - smoothstep(0.18, 0.32, r);
  float glow = (1.0 - smoothstep(0.0, 0.5, r)) * 0.5;
  float a = (core + glow) * vFade * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class Lattice {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'lattice';
    this.uniforms = {
      uCursor: { value: new THREE.Vector3() },
      uRadius: { value: 0.6 },
      uColor: { value: new THREE.Color(0x5fd8ff) },
      uOpacity: { value: 0.42 },
      uSize: { value: 7 },
    };
    // unit-cell lines of a (2R)^3 block
    const pos = [];
    const n = R;
    for (let a = -n; a <= n; a++) {
      for (let b = -n; b <= n; b++) {
        pos.push(-n, a, b, n, a, b); // along X
        pos.push(a, -n, b, a, n, b); // along Y
        pos.push(a, b, -n, a, b, n); // along Z
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
      vertexShader: lineVert, fragmentShader: lineFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    const pts = [];
    for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) pts.push(x, y, z);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.points = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: pointVert, fragmentShader: pointFrag,
      uniforms: { ...this.uniforms, uColor: { value: new THREE.Color(0xbff0ff) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.group.add(this.lines, this.points);
    scene.add(this.group);
    this.step = 0.1;
  }

  setVisible(v) { this.group.visible = v; }

  /** Re-centre the block on the lattice cell nearest to p and update the fade sphere. */
  update(p, step) {
    this.step = step;
    this.group.scale.setScalar(step);
    this.group.position.set(Math.round(p.x / step) * step, Math.round(p.y / step) * step, Math.round(p.z / step) * step);
    this.uniforms.uCursor.value.copy(p);
    // show ~4.5 cells around the cursor, but never vanishingly small or huge
    this.uniforms.uRadius.value = THREE.MathUtils.clamp(step * 6, 0.55, 6);
    this.uniforms.uSize.value = step >= 0.25 ? 9 : 7;
  }
}
