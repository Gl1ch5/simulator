// Application root: wires rendering, editor, simulation and UI together.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RenderSystem } from '../render/Renderer.js';
import { Environment } from '../render/Environment.js';
import { WorldProps } from '../sim/WorldProps.js';
import { Blueprint } from '../model/Blueprint.js';
import { BuildMode } from '../build/BuildMode.js';
import { SimMode } from '../sim/SimMode.js';
import { UI } from '../ui/UI.js';
import { bus } from './EventBus.js';
import { input } from './Input.js';
import { CONFIG } from './config.js';
import { V, Q, A, QA } from './math.js';
import { initRapier } from '../sim/Physics.js';
import { audio } from '../audio/Audio.js';

export class App {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.mode = 'build';
  }

  async init(progress) {
    progress(0.05, 'Рендер…');
    this.rs = new RenderSystem(this.canvas);
    this.scene = this.rs.scene;
    this.camera = this.rs.camera;
    this.env = new Environment(this.rs);
    progress(0.1, 'Загрузка HDR неба…');
    await this.env.load((f) => progress(0.1 + f * 0.6, 'Загрузка HDR неба…'));
    progress(0.75, 'Физический движок…');
    await initRapier();
    this.props = new WorldProps(this.scene);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.target.set(0, 0.4, 0);
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 250;
    this.orbit.zoomSpeed = 1.2;
    this.orbit.screenSpacePanning = true;

    this.setupGizmo();

    this.blueprint = new Blueprint();
    const saved = Blueprint.loadAutosave();
    if (saved?.parts?.length) this.blueprint.restore(saved);

    progress(0.85, 'Мастерская…');
    this.build = new BuildMode(this);
    this.sim = new SimMode(this);
    this.ui = new UI(this, this.uiRoot);
    this.loadSettings();

    bus.on('key', (e) => this.onKey(e));
    this.clock = new THREE.Clock();
    progress(1, 'Готово');
    this.loop();
    return !!saved?.parts?.length;
  }

  setupGizmo() {
    this.gizmo = new TransformControls(this.camera, this.canvas);
    this.gizmo.setSize(0.8);
    this.gizmo.setTranslationSnap(0.05);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.scene.add(this.gizmo.getHelper());
    this.gizmoDragging = false;
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      this.gizmoDragging = e.value;
      if (e.value) this.gizmoStart();
      else this.gizmoEnd();
    });
  }
  get gizmoHover() { return !!(this.gizmo.object && this.gizmo.axis); }
  attachGizmo(obj, id) {
    this.gizmoPartId = id;
    this.gizmo.setTranslationSnap(this.build.workPlane.step);
    this.gizmo.attach(obj);
  }
  toggleGizmoMode() {
    this.gizmo.setMode(this.gizmo.mode === 'translate' ? 'rotate' : 'translate');
    bus.emit('toast', this.gizmo.mode === 'translate' ? 'Гизмо: перемещение' : 'Гизмо: поворот (шаг 15°)');
  }
  gizmoStart() {
    const obj = this.gizmo.object;
    this.gizmoFrom = { pos: obj.position.clone(), quat: obj.quaternion.clone() };
  }
  gizmoEnd() {
    const obj = this.gizmo.object;
    if (!obj || !this.gizmoFrom) return;
    const id = this.gizmoPartId;
    const bp = this.blueprint;
    const part = bp.get(id);
    if (!part) return;
    const from = new THREE.Matrix4().compose(this.gizmoFrom.pos, this.gizmoFrom.quat, new THREE.Vector3(1, 1, 1));
    const to = new THREE.Matrix4().compose(obj.position, obj.quaternion, new THREE.Vector3(1, 1, 1));
    const delta = to.multiply(from.invert());
    if (delta.equals(new THREE.Matrix4())) return;
    bp.commit();
    // move the part and everything mounted on it (motors, gears, joints, ...)
    const moved = new Set();
    const apply = (p) => {
      if (moved.has(p.id)) return;
      moved.add(p.id);
      const m = new THREE.Matrix4().compose(V(p.pos), Q(p.quat), new THREE.Vector3(1, 1, 1)).premultiply(delta);
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(pos, q, s);
      p.pos = A(pos); p.quat = QA(q.normalize());
      for (const d of bp.all()) if ((d.base === p.id || d.mount === p.id) && d.type !== 'bearing' && d.type !== 'hinge' && d.type !== 'spring') apply(d);
    };
    apply(part);
    for (const c of bp.connections) {
      if (moved.has(c.a) && moved.has(c.b)) c.p = A(V(c.p).applyMatrix4(delta));
    }
    bp.changed();
    this.build.select(id);
  }

  // ---------- modes ----------
  async toggleMode() {
    if (this.mode === 'build') {
      this.build.setActive(false);
      this.buildCam = { pos: this.camera.position.clone(), target: this.orbit.target.clone() };
      const ok = await this.sim.start();
      if (!ok) { this.build.setActive(true); return; }
      this.mode = 'sim';
    } else {
      this.sim.stop();
      this.mode = 'build';
      this.build.setActive(true);
      if (this.buildCam) { this.camera.position.copy(this.buildCam.pos); this.orbit.target.copy(this.buildCam.target); }
    }
    bus.emit('mode', this.mode);
  }

  onKey(e) {
    if (e.code === 'F5' || (e.code === 'Enter' && e.ctrlKey)) { e.preventDefault(); this.toggleMode(); return; }
    if (this.mode === 'sim') {
      if (e.code === 'Escape') this.toggleMode();
      else if (e.code === 'KeyR') this.sim.resetVehicle();
      else if (e.code === 'KeyC') {
        this.sim.cameraMode = this.sim.cameraMode === 'orbit' ? 'chase' : 'orbit';
        bus.emit('toast', this.sim.cameraMode === 'orbit' ? 'Камера: свободная (ПКМ — вращать)' : 'Камера: погоня');
      } else if (e.code === 'KeyH') bus.emit('hud:toggleHelp');
    } else if (e.code === 'F1') { e.preventDefault(); bus.emit('help'); }
  }

  // ---------- settings ----------
  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(CONFIG.settingsKey) || '{}'); } catch { /* ignore */ }
    this.settings = { quality: 'high', sound: true, selfCollision: false, ...s };
    this.applySettings();
  }
  saveSettings() {
    try { localStorage.setItem(CONFIG.settingsKey, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.applySettings();
  }
  applySettings() {
    this.rs.setQuality(this.settings.quality);
    this.sim.selfCollision = this.settings.selfCollision;
    audio.setEnabled(this.settings.sound);
  }

  // ---------- loop ----------
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.mode === 'sim') this.sim.update(dt);
    else {
      this.build.update(dt);
      this.panCameraWithKeys(dt);
      this.env.update(this.orbit.target);
    }
    this.orbit.update();
    this.rs.render();
  }

  /** WASD-free panning in build mode with arrow keys. */
  panCameraWithKeys(dt) {
    const f = (input.is('ArrowUp') ? 1 : 0) - (input.is('ArrowDown') ? 1 : 0);
    const r = (input.is('ArrowRight') ? 1 : 0) - (input.is('ArrowLeft') ? 1 : 0);
    if (!f && !r) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const speed = this.camera.position.distanceTo(this.orbit.target) * 0.8 * dt;
    const d = dir.multiplyScalar(f * speed).add(right.multiplyScalar(r * speed));
    this.camera.position.add(d);
    this.orbit.target.add(d);
  }
}
