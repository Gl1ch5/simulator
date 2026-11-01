// Converts a Blueprint into Rapier rigid bodies, joints and drivetrain elements.
//
// Rules:
//  * Parts joined by "connections" (and components mounted on a base) are merged into
//    a single rigid body (union-find).  This is far more stable than fixed joints.
//  * Bearings / hinges become revolute joints, springs become prismatic joints.
//  * Gears on different rotors mesh when their axes are parallel and the centre
//    distance equals the sum of the pitch radii.
import * as THREE from 'three';
import { typeOf, partName } from '../parts/registry.js';
import { buildPartObject, partMatrix } from '../parts/PartFactory.js';
import { V, Q } from '../core/math.js';
import { getMaterial } from '../model/materials.js';
import { COLLISION } from '../core/config.js';
import { Drivetrain, ElectricMotor, CombustionEngine } from './Drivetrain.js';
import { Gear } from '../parts/Gear.js';

class UnionFind {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r);
    let c = x;
    while (this.p.get(c) !== r) { const n = this.p.get(c); this.p.set(c, r); c = n; }
    return r;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

const JOINT_TYPES = new Set(['bearing', 'hinge', 'spring']);
const Y = new THREE.Vector3(0, 1, 0);

export function assemble(bp, world, R, root, { selfCollision = false } = {}) {
  const warnings = [];
  const parts = bp.all();
  const byId = new Map(parts.map((p) => [p.id, p]));
  const uf = new UnionFind();

  const structural = parts.filter((p) => !JOINT_TYPES.has(p.type));
  structural.forEach((p) => uf.find(p.id));
  for (const c of bp.connections) {
    const a = byId.get(c.a), b = byId.get(c.b);
    if (!a || !b) continue;
    if (JOINT_TYPES.has(a.type) || JOINT_TYPES.has(b.type)) continue;
    uf.union(c.a, c.b);
  }
  for (const p of structural) {
    const ref = p.base ?? p.mount;
    if (ref != null && byId.has(ref) && !JOINT_TYPES.has(byId.get(ref).type)) uf.union(p.id, ref);
  }

  // ---- groups ----
  const groups = new Map();
  const groupOf = (id) => {
    const p = byId.get(id);
    if (!p) return null;
    if (JOINT_TYPES.has(p.type)) return groupOf(p.base);
    return groups.get(uf.find(id));
  };
  for (const p of structural) {
    const key = uf.find(p.id);
    if (!groups.has(key)) groups.set(key, { key, parts: [], joints: [], colliders: [], mass: 0 });
    groups.get(key).parts.push(p);
  }
  for (const p of parts) {
    if (!JOINT_TYPES.has(p.type)) continue;
    const g = groupOf(p.id);
    if (g) g.joints.push(p); else warnings.push(`${partName(p)} #${p.id}: не закреплён на детали`);
  }

  // ---- colliders in world space ----
  for (const g of groups.values()) {
    for (const p of [...g.parts, ...g.joints]) {
      const T = typeOf(p);
      const M = partMatrix(p);
      const pq = Q(p.quat);
      const cols = T.colliders(p);
      const totalArea = cols.reduce((s, c) => s + (c.area || 0), 0);
      const pm = T.mass(p);
      for (const c of cols) {
        const mass = c.massOverride ?? (totalArea > 0 ? pm * (c.area / totalArea) : pm / cols.length);
        const wc = { ...c, mass: Math.max(mass, 0.05), part: p, wpos: c.pos.clone().applyMatrix4(M), wquat: pq.clone().multiply(c.quat) };
        if (c.kind === 'hull') {
          const pts = new Float32Array(c.points.length);
          const v = new THREE.Vector3();
          for (let i = 0; i < c.points.length; i += 3) {
            v.set(c.points[i], c.points[i + 1], c.points[i + 2]).applyMatrix4(M);
            pts[i] = v.x; pts[i + 1] = v.y; pts[i + 2] = v.z;
          }
          wc.wpoints = pts;
          // centre of the hull for mass weighting
          const ctr = new THREE.Vector3();
          for (let i = 0; i < pts.length; i += 3) ctr.x += pts[i], ctr.y += pts[i + 1], ctr.z += pts[i + 2];
          wc.wpos = ctr.multiplyScalar(3 / pts.length);
        }
        g.colliders.push(wc);
        g.mass += wc.mass;
      }
    }
    const c = new THREE.Vector3();
    for (const wc of g.colliders) c.addScaledVector(wc.wpos, wc.mass);
    g.center = g.mass > 0 ? c.multiplyScalar(1 / g.mass) : new THREE.Vector3();
  }

  // ---- bodies ----
  const partGroups = selfCollision ? COLLISION.PART_SELF : COLLISION.PART_NO_SELF;
  for (const g of groups.values()) {
    const bd = R.RigidBodyDesc.dynamic().setTranslation(g.center.x, g.center.y, g.center.z)
      .setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.02).setLinearDamping(0.01);
    g.body = world.createRigidBody(bd);
    for (const wc of g.colliders) {
      let desc = null;
      const rel = wc.wpos.clone().sub(g.center);
      switch (wc.kind) {
        case 'cuboid': desc = R.ColliderDesc.cuboid(Math.max(wc.hx, 0.002), Math.max(wc.hy, 0.002), Math.max(wc.hz, 0.002)); break;
        case 'cylinder':
          desc = wc.roundness > 0
            ? R.ColliderDesc.roundCylinder(Math.max(wc.halfHeight - wc.roundness, 0.001), Math.max(wc.radius - wc.roundness, 0.001), wc.roundness)
            : R.ColliderDesc.cylinder(Math.max(wc.halfHeight, 0.001), Math.max(wc.radius, 0.002));
          break;
        case 'ball': desc = R.ColliderDesc.ball(wc.radius); break;
        case 'hull': {
          const pts = new Float32Array(wc.wpoints.length);
          for (let i = 0; i < pts.length; i += 3) {
            pts[i] = wc.wpoints[i] - g.center.x; pts[i + 1] = wc.wpoints[i + 1] - g.center.y; pts[i + 2] = wc.wpoints[i + 2] - g.center.z;
          }
          desc = R.ColliderDesc.convexHull(pts);
          break;
        }
        default: break;
      }
      if (!desc) { warnings.push(`Не удалось создать коллайдер для #${wc.part.id}`); continue; }
      if (wc.kind !== 'hull') {
        desc.setTranslation(rel.x, rel.y, rel.z);
        desc.setRotation({ x: wc.wquat.x, y: wc.wquat.y, z: wc.wquat.z, w: wc.wquat.w });
      }
      const mat = getMaterial(wc.part.material);
      desc.setMass(wc.mass).setFriction(mat.friction).setRestitution(mat.restitution)
        .setCollisionGroups(wc.ghost ? COLLISION.NONE : partGroups);
      if (wc.ghost) desc.setSolverGroups(COLLISION.NONE);
      world.createCollider(desc, g.body);
    }
  }

  // ---- visuals ----
  const visuals = [];
  const partObjects = new Map();
  for (const g of groups.values()) {
    const holder = new THREE.Group();
    holder.position.copy(g.center);
    root.add(holder);
    g.holder = holder;
    for (const p of [...g.parts, ...g.joints]) {
      const obj = buildPartObject(p);
      obj.position.sub(g.center);
      holder.add(obj);
      partObjects.set(p.id, obj);
    }
    visuals.push({ body: g.body, obj: holder });
  }

  // ---- joints ----
  const dtrain = new Drivetrain();
  const joints = []; // { part, joint, kind }
  const rotatingSide = new Map(); // group key -> { base group, axis, part }
  for (const p of parts) {
    if (!JOINT_TYPES.has(p.type)) continue;
    const gb = groupOf(p.base), gm = p.moving != null ? groups.get(uf.find(p.moving)) : null;
    if (!gb || !gm) { warnings.push(`${partName(p)} #${p.id}: нужна деталь с обеих сторон`); continue; }
    if (gb === gm) { warnings.push(`${partName(p)} #${p.id}: заблокирован — обе стороны жёстко соединены между собой`); continue; }
    const anchor = V(p.pos);
    const axis = Y.clone().applyQuaternion(Q(p.quat)).normalize();
    const a1 = anchor.clone().sub(gb.center), a2 = anchor.clone().sub(gm.center);
    let data;
    if (p.type === 'spring') data = R.JointData.prismatic(a1, a2, axis);
    else data = R.JointData.revolute(a1, a2, axis);
    const joint = world.createImpulseJoint(data, gb.body, gm.body, true);
    joint.setContactsEnabled(false);
    if (p.type === 'hinge') {
      const lim = (p.maxAngle * Math.PI) / 180;
      if (lim < Math.PI) joint.setLimits(-lim - 0.02, lim + 0.02);
      joint.configureMotorModel(R.MotorModel.ForceBased);
      joint.configureMotorPosition(0, 0, p.damping * 0.05);
    } else if (p.type === 'spring') {
      joint.setLimits(-p.travel, p.travel);
      joint.configureMotorModel(R.MotorModel.ForceBased);
      joint.configureMotorPosition(0, p.stiffness, p.damping);
    } else {
      dtrain.addBrake({ moving: gm.body, base: gb.body, axisLocal: axis, part: p });
    }
    if (p.type !== 'spring' && !rotatingSide.has(gm.key)) rotatingSide.set(gm.key, { base: gb, axis, part: p });
    joints.push({ part: p, joint, kind: p.type, base: gb, moving: gm, input: 0 });
  }

  // ---- power units ----
  const powerUnits = new Map(); // part id -> unit
  for (const p of parts) {
    if (p.type !== 'motor' && p.type !== 'engine') continue;
    const g = groupOf(p.id);
    const T = typeOf(p);
    const spec = T.spec(p);
    const axis = Y.clone().applyQuaternion(Q(p.quat)).normalize();
    const rotor = dtrain.addVirtualRotor({ housing: g.body, axisLocal: axis, inertia: spec.inertia });
    const unit = p.type === 'motor' ? new ElectricMotor(p, spec, rotor) : new CombustionEngine(p, spec, rotor);
    unit.rotorObj = partObjects.get(p.id)?.getObjectByName('rotor');
    unit.gears = [];
    dtrain.addPower(unit);
    powerUnits.set(p.id, unit);
  }

  // ---- gears ----
  const gears = [];
  for (const p of parts) {
    if (p.type !== 'gear') continue;
    const mountPart = byId.get(p.mount);
    const center = V(p.pos);
    const axis = Y.clone().applyQuaternion(Q(p.quat)).normalize();
    const radius = Gear.radius(p);
    let gear;
    if (mountPart && powerUnits.has(mountPart.id)) {
      const unit = powerUnits.get(mountPart.id);
      gear = { part: p, rotor: unit.rotor, radius, center, axis, unit };
      if (unit instanceof CombustionEngine) { gear.ratioFn = () => unit.ratio(); gear.clutchFn = () => unit.clutch(); }
      unit.gears.push(gear);
      const obj = partObjects.get(p.id);
      if (obj) unit.gearObjs = [...(unit.gearObjs || []), { obj, baseQuat: obj.quaternion.clone() }];
    } else {
      const g = groupOf(p.id);
      const rs = rotatingSide.get(g.key);
      gear = { part: p, rotor: dtrain.physicalRotor(g.body, rs ? rs.base.body : null, axis), radius, center, axis, group: g };
    }
    gears.push(gear);
  }
  const meshes = [];
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const A = gears[i], B = gears[j];
      if (A.rotor === B.rotor || (!A.rotor.virtual && !B.rotor.virtual && A.rotor.entry === B.rotor.entry)) continue;
      const info = meshInfo(A, B);
      if (!info.ok) continue;
      if (Math.abs(A.part.module - B.part.module) > 1e-4) {
        warnings.push(`Шестерни #${A.part.id} и #${B.part.id}: разный модуль зуба — не сцепляются`);
        continue;
      }
      dtrain.addMesh(A, B);
      meshes.push({ a: A, b: B });
    }
  }
  for (const g of gears) {
    if (!meshes.some((m) => m.a === g || m.b === g)) warnings.push(`Шестерня #${g.part.id} ни с чем не сцеплена`);
  }

  // ---- controls / wiring ----
  const seats = parts.filter((p) => p.type === 'seat');
  const bindings = [];
  for (const s of seats) {
    for (const w of s.wires || []) {
      const target = byId.get(w.to);
      if (!target) continue;
      bindings.push({ seat: s, target, channel: w.ch, invert: !!w.invert, unit: powerUnits.get(target.id), joint: joints.find((j) => j.part.id === target.id) });
    }
  }
  if (!seats.length && (powerUnits.size || joints.length)) warnings.push('Нет сиденья с пультом — моторы и руль не подключены (инструмент «Провод»)');
  for (const u of powerUnits.values()) {
    if (!bindings.some((b) => b.unit === u)) warnings.push(`${partName(u.part)} #${u.part.id}: не подключён проводом к пульту`);
  }

  // main body for camera
  let main = null;
  if (seats.length) main = groupOf(seats[0].id);
  if (!main) main = [...groups.values()].sort((a, b) => b.mass - a.mass)[0] || null;

  const totalMass = [...groups.values()].reduce((s, g) => s + g.mass, 0);
  return { groups, visuals, joints, dtrain, powerUnits, gears, meshes, bindings, seats, main, warnings, totalMass, partObjects };
}

/** Geometric meshing test shared by the assembler and the editor overlay. */
export function meshInfo(A, B) {
  const axisDot = Math.abs(A.axis.dot(B.axis));
  const d = B.center.clone().sub(A.center);
  const axial = d.dot(A.axis);
  const perp = d.clone().addScaledVector(A.axis, -axial).length();
  const need = A.radius + B.radius;
  const mod = Math.max(A.part.module, B.part.module);
  const tol = Math.max(mod * 1.5, 0.01);
  const ok = axisDot > 0.985 && Math.abs(perp - need) < tol && Math.abs(axial) < (A.part.width + B.part.width) / 2;
  return { ok, perp, need, axial, axisDot };
}
