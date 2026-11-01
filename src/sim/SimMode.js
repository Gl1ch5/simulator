// Play / test mode: builds the physics world from the blueprint and runs it.
import * as THREE from 'three';
import { initRapier, createWorld } from './Physics.js';
import { assemble } from './Assembler.js';
import { CONFIG } from '../core/config.js';
import { input } from '../core/Input.js';
import { bus } from '../core/EventBus.js';
import { clamp } from '../core/math.js';
import { audio } from '../audio/Audio.js';
import { CombustionEngine } from './Drivetrain.js';

const RPM = 60 / (2 * Math.PI);

export class SimMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.root = new THREE.Group();
    this.root.name = 'simRoot';
    this.controls = { throttle: 0, steer: 0, brake: 0, speed: 0 };
    this.cameraMode = 'orbit';
    this.selfCollision = false;
    this.acc = 0;
    this.lastMainPos = new THREE.Vector3();
  }

  async start() {
    const R = await initRapier();
    this.R = R;
    const app = this.app;
    this.world = createWorld(R);
    app.props.createPhysics(this.world, R);
    app.scene.add(this.root);
    try {
      this.asm = assemble(app.blueprint, this.world, R, this.root, { selfCollision: this.selfCollision });
    } catch (e) {
      console.error(e);
      this.stop();
      bus.emit('toast', 'Ошибка сборки: ' + e.message, 'error');
      return false;
    }
    this.active = true;
    this.acc = 0;
    this.time = 0;
    this.controls = { throttle: 0, steer: 0, brake: 0, speed: 0 };
    if (this.asm.main) this.lastMainPos.copy(this.asm.main.center);
    bus.emit('sim:started', this.asm);
    return true;
  }

  stop() {
    this.active = false;
    audio.stopAll();
    if (this.world) { this.world.free(); this.world = null; }
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.root.clear();
    this.app.scene.remove(this.root);
    this.app.props.reset();
    this.asm = null;
    bus.emit('sim:stopped');
  }

  readControls(dt) {
    const c = this.controls;
    const fwd = input.any('KeyW', 'ArrowUp') ? 1 : 0;
    const back = input.any('KeyS', 'ArrowDown') ? 1 : 0;
    const left = input.any('KeyA', 'ArrowLeft') ? 1 : 0;
    const right = input.any('KeyD', 'ArrowRight') ? 1 : 0;
    const tgtThr = fwd - back;
    c.throttle += clamp(tgtThr - c.throttle, -dt * 4, dt * 4);
    const steerSpeed = this.asm.seats[0]?.steerSpeed ?? 2.5;
    const tgtSteer = left - right;
    const rate = tgtSteer === 0 ? steerSpeed * 1.5 : steerSpeed;
    c.steer += clamp(tgtSteer - c.steer, -dt * rate, dt * rate);
    c.brake = input.is('Space') ? 1 : 0;
  }

  applyBindings() {
    const c = this.controls;
    const values = { throttle: c.throttle, steer: c.steer, brake: c.brake };
    for (const u of this.asm.powerUnits.values()) u.throttle = 0;
    for (const j of this.asm.joints) j.input = 0;
    for (const b of this.asm.bindings) {
      const v = (values[b.channel] || 0) * (b.invert ? -1 : 1);
      if (b.unit) b.unit.throttle = clamp(b.unit.throttle + v, -1, 1);
      if (b.joint) { b.joint.input += v; b.joint.bound = true; }
    }
    for (const j of this.asm.joints) {
      const p = j.part;
      if (j.kind === 'hinge' && j.bound) {
        const target = clamp(j.input, -1, 1) * (p.maxAngle * Math.PI) / 180;
        if (j.lastTarget === undefined || Math.abs(j.lastTarget - target) > 1e-4) {
          j.joint.configureMotorPosition(target, p.stiffness, p.damping);
          j.lastTarget = target;
        }
      } else if (j.kind === 'bearing') {
        const br = this.asm.dtrain.brakes.find((b) => b.part === p);
        if (br) br.input = clamp(Math.abs(j.input), 0, 1);
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    const asm = this.asm;
    this.readControls(dt);
    // speed along the seat's forward axis
    if (asm.main) {
      const v = asm.main.body.linvel();
      const vel = new THREE.Vector3(v.x, v.y, v.z);
      const seat = asm.seats[0];
      let fwd = new THREE.Vector3(0, 0, -1);
      if (seat) {
        const r = asm.main.body.rotation();
        fwd.applyQuaternion(new THREE.Quaternion(...seat.quat)).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        this.controls.speed = vel.dot(fwd);
      } else this.controls.speed = vel.length();
    }
    this.applyBindings();
    const step = 1 / CONFIG.physicsHz;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= step && n < CONFIG.maxSubsteps) {
      asm.dtrain.step(step, this.controls);
      this.world.step();
      this.acc -= step; n++;
      this.time += step;
    }
    if (n === CONFIG.maxSubsteps) this.acc = 0;
    this.syncVisuals(dt);
    this.app.props.sync();
    this.updateAudio();
    this.updateCamera(dt);
    bus.emit('sim:tick', this.hudData());
  }

  syncVisuals(dt) {
    for (const v of this.asm.visuals) {
      const t = v.body.translation(), r = v.body.rotation();
      v.obj.position.set(t.x, t.y, t.z);
      v.obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
    const qy = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    for (const u of this.asm.powerUnits.values()) {
      const r = u.rotor;
      if (u.rotorObj) u.rotorObj.rotation.y = r.angle;
      let outAngle = r.angle;
      if (u instanceof CombustionEngine) {
        const ratio = u.ratio();
        u.outAngle = (u.outAngle || 0) + (ratio ? r.relW / ratio : 0) * dt;
        outAngle = u.outAngle;
      }
      for (const g of u.gearObjs || []) {
        g.obj.quaternion.copy(g.baseQuat).multiply(qy.setFromAxisAngle(Y, outAngle));
      }
    }
    // steering wheel visual
    for (const s of this.asm.seats) {
      const obj = this.asm.partObjects.get(s.id)?.getObjectByName('steeringWheel');
      if (obj) obj.rotation.y = this.controls.steer * 1.6;
    }
  }

  updateAudio() {
    for (const u of this.asm.powerUnits.values()) {
      const kind = u instanceof CombustionEngine ? 'engine' : 'motor';
      audio.update(u.part.id, kind, u.rpm, kind === 'engine' ? u.load : Math.abs(u.throttle));
    }
  }

  mainPosition() {
    if (!this.asm?.main) return null;
    const t = this.asm.main.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  updateCamera(dt) {
    const p = this.mainPosition();
    if (!p) return;
    const cam = this.app.camera, ctl = this.app.orbit;
    if (this.cameraMode === 'orbit') {
      const d = p.clone().sub(this.lastMainPos);
      cam.position.add(d);
      ctl.target.add(d);
    } else {
      const r = this.asm.main.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const seat = this.asm.seats[0];
      const fwd = new THREE.Vector3(0, 0, -1);
      if (seat) fwd.applyQuaternion(new THREE.Quaternion(...seat.quat));
      fwd.applyQuaternion(q); fwd.y = 0;
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
      fwd.normalize();
      const want = p.clone().addScaledVector(fwd, -6).add(new THREE.Vector3(0, 2.4, 0));
      cam.position.lerp(want, 1 - Math.exp(-dt * 4));
      ctl.target.lerp(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 1 - Math.exp(-dt * 8));
    }
    this.lastMainPos.copy(p);
    this.app.env.update(p);
  }

  hudData() {
    const asm = this.asm;
    return {
      speed: this.controls.speed * 3.6,
      throttle: this.controls.throttle,
      steer: this.controls.steer,
      brake: this.controls.brake,
      units: [...asm.powerUnits.values()].map((u) => ({
        id: u.part.id,
        engine: u instanceof CombustionEngine,
        name: u.spec.name,
        rpm: u.rpm,
        maxRpm: u.spec.maxRpm || u.spec.freeRpm,
        torque: u.torque,
        power: u.power,
        gear: u instanceof CombustionEngine ? u.gearLabel() : null,
      })),
      mass: asm.totalMass,
      time: this.time,
      height: this.mainPosition()?.y ?? 0,
    };
  }

  resetVehicle() {
    this.stop();
    return this.start();
  }
}

export { RPM };
