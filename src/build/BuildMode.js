// Editor: owns part visuals, pointer handling, tools, selection and overlays.
import * as THREE from 'three';
import { WorkPlane } from './WorkPlane.js';
import { Lattice } from './Lattice.js';
import { Snapper } from './Snapper.js';
import { buildPartObject, worldSnapPoints } from '../parts/PartFactory.js';
import { bus } from '../core/EventBus.js';
import { input } from '../core/Input.js';
import { CONFIG } from '../core/config.js';
import { V, Q } from '../core/math.js';
import { dot, polyline, disposeGroup, label } from './overlays.js';
import { createTools } from './tools/index.js';
import { Gear } from '../parts/Gear.js';
import { meshInfo } from '../sim/Assembler.js';

export class BuildMode {
  constructor(app) {
    this.app = app;
    this.blueprint = app.blueprint;
    this.camera = app.camera;
    this.scene = app.scene;
    this.canvas = app.canvas;
    this.active = true;

    this.settings = {
      material: 'steel',
      autoConnect: true,
      beamProfile: 'tube',
      beamSize: CONFIG.beamSize,
      plateThickness: CONFIG.plateThickness,
      round: 0,
      circleSegments: 32,
      gearTeeth: 20,
      gearModule: 0.006,
      motorVariant: 'medium',
      engineVariant: 'i4',
      axis: 'X',
      showConnections: true,
    };

    this.partRoot = new THREE.Group(); this.partRoot.name = 'parts';
    this.overlay = new THREE.Group(); this.overlay.name = 'overlay';
    this.infoLayer = new THREE.Group(); this.infoLayer.name = 'info';
    this.scene.add(this.partRoot, this.overlay, this.infoLayer);

    this.workPlane = new WorkPlane(this.scene);
    this.workPlane.setStep(CONFIG.defaultGrid);
    this.lattice = new Lattice(this.scene);
    this.lattice.update(new THREE.Vector3(), this.workPlane.step);
    // axis inference guide (SketchUp-style coloured line)
    this.guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineDashedMaterial({ color: 0xff6b6b, dashSize: 0.06, gapSize: 0.04, depthTest: false, transparent: true }));
    this.guide.renderOrder = 32;
    this.guide.visible = false;
    this.snapper = new Snapper(this);
    this.cursor = dot(new THREE.Vector3(), 0x39d0ff, 0.022);
    this.cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 24), new THREE.MeshBasicMaterial({ color: 0x39d0ff, depthTest: false, transparent: true, side: THREE.DoubleSide }));
    this.cursorRing.renderOrder = 31;
    this.overlay.add(this.cursor, this.cursorRing, this.guide);

    this.objects = new Map();
    this.selected = null;
    this.hovered = null;
    this.ndc = new THREE.Vector2();
    this.lastSnap = null;

    this.tools = createTools(this);
    this.tool = null;
    this.setTool('beam');

    this.bindPointer();
    bus.on('blueprint:changed', () => this.onBlueprintChanged());
    bus.on('key', (e) => this.onKey(e));
    this.rebuildAll();
  }

  // ---------- tools ----------
  setTool(id) {
    if (!this.tools[id]) return;
    this.tool?.deactivate();
    this.tool = this.tools[id];
    this.toolId = id;
    this.tool.activate();
    if (id !== 'select') this.app.gizmo?.detach();
    else if (this.selected) this.attachGizmo();
    this.updateHint();
    bus.emit('tool:changed', id);
  }
  updateHint() { bus.emit('hint', this.tool?.hint() || ''); }
  setSetting(k, v) {
    this.settings[k] = v;
    bus.emit('settings:changed', this.settings);
    this.updateHint();
    if (this.lastNdc) this.pointerMove(this.lastNdc, null);
  }

  // ---------- visuals ----------
  onBlueprintChanged() {
    this.snapper.invalidate();
    this.rebuildAll();
    this.blueprint.autosave();
  }

  rebuildAll() {
    for (const obj of this.objects.values()) { obj.traverse((o) => o.geometry?.dispose()); }
    this.partRoot.clear();
    this.objects.clear();
    for (const part of this.blueprint.all()) {
      const obj = buildPartObject(part);
      this.partRoot.add(obj);
      this.objects.set(part.id, obj);
    }
    if (this.selected && !this.blueprint.get(this.selected)) this.select(null);
    else if (this.selected) this.refreshOutline();
    this.rebuildInfo();
  }

  /** Connection markers, wires and gear-mesh indicators. */
  rebuildInfo() {
    disposeGroup(this.infoLayer);
    if (!this.active) return;
    const bp = this.blueprint;
    const showConn = this.settings.showConnections || this.toolId === 'connect';
    if (showConn) {
      for (const c of bp.connections) this.infoLayer.add(dot(V(c.p), 0xffb020, 0.014));
    }
    // wires: seat -> targets
    for (const p of bp.all()) {
      if (p.type !== 'seat') continue;
      for (const w of p.wires || []) {
        const t = bp.get(w.to);
        if (!t) continue;
        const a = V(p.pos), b = V(t.pos);
        const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.25, 0));
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const color = w.ch === 'throttle' ? 0x3dff8a : w.ch === 'steer' ? 0x39d0ff : 0xff5a4a;
        const line = polyline(curve.getPoints(24), color, false, true);
        this.infoLayer.add(line);
      }
    }
    // gear meshing indicators
    const gears = bp.all().filter((p) => p.type === 'gear').map((p) => ({
      part: p, center: V(p.pos), axis: new THREE.Vector3(0, 1, 0).applyQuaternion(Q(p.quat)), radius: Gear.radius(p),
    }));
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const info = meshInfo(gears[i], gears[j]);
        if (info.axisDot < 0.985 || Math.abs(info.axial) > 0.2 || info.perp > info.need * 1.6 + 0.05) continue;
        const ok = info.ok && Math.abs(gears[i].part.module - gears[j].part.module) < 1e-4;
        this.infoLayer.add(polyline([gears[i].center, gears[j].center], ok ? 0x3dff8a : 0xff5a4a));
        const mid = gears[i].center.clone().add(gears[j].center).multiplyScalar(0.5);
        const [za, zb] = [gears[i].part.teeth, gears[j].part.teeth].sort((x, y) => x - y);
        this.infoLayer.add(label(ok ? `сцеплены ${za}:${zb}  i=${(zb / za).toFixed(2)}` : `нужно ${info.need.toFixed(3)} м, сейчас ${info.perp.toFixed(3)}`, mid, ok ? '#7dffb0' : '#ff8a7a'));
      }
    }
  }

  setActive(v) {
    this.active = v;
    this.partRoot.visible = v;
    this.overlay.visible = v;
    this.infoLayer.visible = v;
    this.workPlane.setVisible(v);
    this.lattice.setVisible(v);
    if (!v) { this.app.gizmo?.detach(); this.setHover(null); this.app.rs.selectOutline.selectedObjects = []; }
    else { this.rebuildAll(); if (this.selected && this.toolId === 'select') this.attachGizmo(); }
  }

  // ---------- selection ----------
  select(id) {
    this.selected = id;
    this.refreshOutline();
    if (id && this.toolId === 'select') this.attachGizmo(); else this.app.gizmo?.detach();
    bus.emit('selection', id ? this.blueprint.get(id) : null);
  }
  refreshOutline() {
    const obj = this.selected ? this.objects.get(this.selected) : null;
    this.app.rs.selectOutline.selectedObjects = obj ? [obj] : [];
  }
  attachGizmo() {
    const obj = this.objects.get(this.selected);
    if (obj) this.app.attachGizmo(obj, this.selected);
  }
  setHover(id) {
    if (this.hovered === id) return;
    this.hovered = id;
    const obj = id ? this.objects.get(id) : null;
    this.app.rs.hoverOutline.selectedObjects = obj ? [obj] : [];
  }

  // ---------- pointer ----------
  bindPointer() {
    const c = this.canvas;
    let downPos = null, downButton = -1;
    const toNdc = (e) => {
      const r = c.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    c.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.lastNdc = toNdc(e);
      this.lastEvent = e;
      if (this.app.gizmoDragging) return;
      this.pointerMove(this.lastNdc, e);
    });
    c.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      downPos = [e.clientX, e.clientY]; downButton = e.button;
      if (e.button === 0 && !this.app.gizmoHover) {
        const ndc = toNdc(e);
        const snap = this.resolve(ndc, e);
        this.tool.onDown(snap, e, ndc);
        // the active slice follows the last placed point -> true 3D construction
        if (snap && ['beam', 'rect', 'polygon', 'circle'].includes(this.toolId)) this.workPlane.setFocus(snap.point);
        this.updateHint();
      }
    });
    c.addEventListener('pointerup', (e) => {
      if (!this.active) return;
      if (e.button === 0) {
        const ndc = toNdc(e);
        this.tool.onUp(this.resolve(ndc, e), e, ndc);
        this.updateHint();
      }
      if (e.button === 2 && downPos && downButton === 2) {
        const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
        if (moved < 5) { this.tool.cancel(); this.updateHint(); }
      }
      downPos = null;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Shift + wheel moves the active slice through the lattice (captured before OrbitControls zoom)
    window.addEventListener('wheel', (e) => {
      if (!this.active || !e.shiftKey || e.target !== c) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.workPlane.nudge(e.deltaY < 0 ? 1 : -1);
      if (this.lastNdc) this.pointerMove(this.lastNdc, this.lastEvent);
    }, { capture: true, passive: false });
  }

  resolve(ndc, e) {
    const opts = this.tool.snapOptions(e) || {};
    if (opts.none) return null;
    return this.snapper.resolve(ndc, opts);
  }

  pointerMove(ndc, e) {
    const snap = this.resolve(ndc, e || this.lastEvent || {});
    this.lastSnap = snap;
    if (snap) {
      this.cursor.visible = this.cursorRing.visible = true;
      this.cursor.position.copy(snap.point);
      this.cursorRing.position.copy(snap.point);
      this.cursorRing.lookAt(snap.point.clone().add(snap.normal));
      const AXC = { X: 0xff6b6b, Y: 0x6bff8a, Z: 0x6b9bff };
      const col = snap.kind === 'vertex' ? 0xffd23f : snap.kind === 'surface' ? 0x3dff8a : snap.kind === 'line' ? 0xff7ad9 : snap.kind === 'axis' ? AXC[snap.axis] : 0x39d0ff;
      if (snap.kind === 'axis') {
        const dir = snap.point.clone().sub(snap.from);
        const len = dir.length();
        dir.normalize();
        this.guide.geometry.setFromPoints([snap.from.clone().addScaledVector(dir, -len * 0.25 - 0.3), snap.point.clone().addScaledVector(dir, len * 0.25 + 0.3)]);
        this.guide.computeLineDistances();
        this.guide.material.color.setHex(col);
        this.guide.visible = true;
      } else this.guide.visible = false;
      this.cursor.material.color.setHex(col);
      this.cursorRing.material.color.setHex(col);
      this.workPlane.setCursor(snap.point);
      this.lattice.update(snap.point, this.workPlane.step);
      bus.emit('cursor', snap);
    } else {
      this.cursor.visible = this.cursorRing.visible = false;
      this.guide.visible = false;
    }
    this.tool.onMove(snap, e || {}, ndc);
  }

  // ---------- keyboard ----------
  onKey(e) {
    if (!this.active) return;
    if (this.tool.onKey(e)) { this.updateHint(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); this.blueprint.undo(); return; }
    if (ctrl && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); this.blueprint.redo(); return; }
    if (ctrl) return;
    switch (e.code) {
      case 'KeyQ': this.workPlane.nudge(-1); break;
      case 'KeyE': this.workPlane.nudge(1); break;
      case 'Digit0': case 'Backquote': this.workPlane.setMode('auto'); this.toast('Срез сетки: авто (по взгляду камеры)'); break;
      case 'Digit1': this.workPlane.setMode('XZ'); break;
      case 'Digit2': this.workPlane.setMode('XY'); break;
      case 'Digit3': this.workPlane.setMode('YZ'); break;
      case 'Tab': {
        e.preventDefault();
        if (this.tool.cycleAxis) this.tool.cycleAxis();
        break;
      }
      case 'Escape': if (!this.tool.cancel()) this.setTool('select'); break;
      case 'Delete': case 'Backspace':
        if (this.selected) { this.blueprint.commit(); this.blueprint.remove(this.selected); this.select(null); }
        break;
      default: {
        const map = this.toolHotkeys();
        if (map[e.code]) this.setTool(map[e.code]);
      }
    }
    if (this.lastNdc) this.pointerMove(this.lastNdc, this.lastEvent);
    this.updateHint();
  }

  toolHotkeys() {
    const m = {};
    for (const [id, t] of Object.entries(this.tools)) if (t.hotkey) m['Key' + t.hotkey] = id;
    return m;
  }

  // ---------- helpers used by tools ----------
  /** Connect newly created part to the parts under the given snap results. */
  autoConnect(newId, snaps) {
    if (!this.settings.autoConnect) return;
    for (const s of snaps) {
      if (s && s.partId != null && s.partId !== newId) {
        const other = this.blueprint.get(s.partId);
        if (!other || ['bearing', 'hinge', 'spring', 'gear'].includes(other.type)) continue;
        this.blueprint.connect(newId, s.partId, [s.point.x, s.point.y, s.point.z]);
      }
    }
  }

  /** Parts whose snap points coincide with p. */
  partsAt(p, eps = 1e-3) {
    const res = new Set();
    for (const part of this.blueprint.all()) {
      if (worldSnapPoints(part).some((q) => q.distanceTo(p) < eps)) res.add(part.id);
    }
    return res;
  }

  toast(msg, kind = 'info') { bus.emit('toast', msg, kind); }

  update() {
    if (!this.active) return;
    this.workPlane.autoOrient(this.camera);
    // keep cursor ring a constant screen size
    const d = this.camera.position.distanceTo(this.cursor.position);
    const s = Math.max(0.3, d * 0.12);
    this.cursor.scale.setScalar(s);
    this.cursorRing.scale.setScalar(s);
  }
}
