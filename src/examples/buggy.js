// Example vehicle assembled ONLY from the same primitives the player has:
// beams, plates, circles extruded into tyres, bearings, hinges, gears, a motor and a seat.
import * as THREE from 'three';
import { Beam } from '../parts/Beam.js';
import { Shape } from '../parts/Shape.js';
import { Gear } from '../parts/Gear.js';
import { Bearing, Hinge } from '../parts/Joints.js';
import { Motor } from '../parts/Power.js';
import { Seat } from '../parts/Seat.js';
import { A, QA, quatFromBasis, quatYTo } from '../core/math.js';

export function buildBuggy(bp, { withEngine = false } = {}) {
  bp.commit();
  bp.clear();
  bp.name = withEngine ? 'Багги с ДВС' : 'Электробагги';
  const add = (p) => bp.add(p);
  const link = (a, b, p) => bp.connect(a.id, b.id, p);
  const beam = (a, b, profile = 'tube', size = 0.04, material = 'painted') => add(Beam.create({ a, b, profile, size, material }));

  const Y = 0.38; // frame height (beam centre line)
  const X = 0.45, Z = 0.9;
  // ---- frame perimeter ----
  const fl = beam([-X, Y, -Z], [X, Y, -Z]);
  const fr = beam([X, Y, -Z], [X, Y, Z]);
  const bk = beam([X, Y, Z], [-X, Y, Z]);
  const lf = beam([-X, Y, Z], [-X, Y, -Z]);
  link(fl, fr, [X, Y, -Z]); link(fr, bk, [X, Y, Z]); link(bk, lf, [-X, Y, Z]); link(lf, fl, [-X, Y, -Z]);
  const motorCross = beam([-X, Y, 0.52], [X, Y, 0.52]);
  link(motorCross, fr, [X, Y, 0.52]); link(motorCross, lf, [-X, Y, 0.52]);
  // floor plate
  const floor = add(Shape.create({
    pos: [-X, Y + 0.02, -Z], quat: QA(quatFromBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))),
    points: [[0, 0], [2 * X, 0], [2 * X, -(Z + 0.45)], [0, -(Z + 0.45)]], depth: 0.006, material: 'aluminum', round: 0.04,
  }));
  link(floor, fl, [0, Y + 0.02, -Z]); link(floor, fr, [X, Y + 0.02, 0]); link(floor, lf, [-X, Y + 0.02, 0]);
  // roll bar
  const rbL = beam([-0.4, Y + 0.02, 0.42], [-0.4, 1.25, 0.42], 'pipe', 0.04, 'steel');
  const rbR = beam([0.4, Y + 0.02, 0.42], [0.4, 1.25, 0.42], 'pipe', 0.04, 'steel');
  const rbT = beam([-0.4, 1.25, 0.42], [0.4, 1.25, 0.42], 'pipe', 0.04, 'steel');
  link(rbL, floor, [-0.4, Y, 0.42]); link(rbR, floor, [0.4, Y, 0.42]); link(rbT, rbL, [-0.4, 1.25, 0.42]); link(rbT, rbR, [0.4, 1.25, 0.42]);
  const rbS1 = beam([-0.4, 1.25, 0.42], [-0.4, Y, 0.9], 'pipe', 0.03, 'steel');
  const rbS2 = beam([0.4, 1.25, 0.42], [0.4, Y, 0.9], 'pipe', 0.03, 'steel');
  link(rbS1, rbL, [-0.4, 1.25, 0.42]); link(rbS1, bk, [-0.4, Y, 0.9]); link(rbS2, rbR, [0.4, 1.25, 0.42]); link(rbS2, bk, [0.4, Y, 0.9]);
  // nose
  const nose = add(Shape.create({
    pos: [-X, Y + 0.02, -Z], quat: QA(quatFromBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1))),
    points: [[0.05, 0], [2 * X - 0.05, 0], [2 * X - 0.15, 0.22], [0.15, 0.22]], depth: 0.006, material: 'painted', round: 0.03,
  }));
  link(nose, fl, [0, Y, -Z]);

  // ---- rear axle with wheels, bearings in stands ----
  const R = 0.3, W = 0.15, axleZ = 0.7;
  const standL = beam([-X, Y - 0.02, axleZ], [-X, R, axleZ], 'bar', 0.04, 'steel');
  const standR = beam([X, Y - 0.02, axleZ], [X, R, axleZ], 'bar', 0.04, 'steel');
  link(standL, lf, [-X, Y, axleZ]); link(standR, fr, [X, Y, axleZ]);
  const axle = beam([-0.75, R, axleZ], [0.75, R, axleZ], 'rod', 0.035, 'steel');
  const wheel = (x, z, side) => add(Shape.create({
    pos: [x, R, z], quat: QA(quatFromBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(side, 0, 0))),
    circle: { r: R, segments: 40 }, depth: W, material: 'rubber',
  }));
  const wRL = wheel(-0.6, axleZ, -1), wRR = wheel(0.6, axleZ, 1);
  link(wRL, axle, [-0.6, R, axleZ]); link(wRR, axle, [0.6, R, axleZ]);
  const qX = QA(quatYTo(new THREE.Vector3(1, 0, 0)));
  const brL = add(Bearing.create({ pos: [-X, R, axleZ], quat: qX, base: standL.id, moving: axle.id }));
  const brR = add(Bearing.create({ pos: [X, R, axleZ], quat: qX, base: standR.id, moving: axle.id }));
  for (const b of [brL, brR]) b.brake = 250;

  // ---- gears + motor ----
  const module = 0.006;
  const axleGear = add(Gear.create({ pos: [0, R, axleZ], quat: qX, teeth: 48, module, width: 0.03, mount: axle.id }));
  const pinionR = Gear.radius({ teeth: 12, module });
  const dist = Gear.radius(axleGear) + pinionR;
  let power;
  if (!withEngine) {
    const len = 0.18;
    const shaftTip = len / 2 + 0.06 * 0.7;
    power = add(Motor.create({ pos: [-shaftTip, R, axleZ - dist], quat: qX, base: motorCross.id, variant: 'medium' }));
  } else {
    // imported lazily to keep the electric example lightweight
    power = add({ type: 'engine', pos: [-(0.42 / 2 + 0.042), R + 0.02, axleZ - dist], quat: qX, base: motorCross.id, variant: 'moto', invert: false, auto: true });
  }
  const pinion = add(Gear.create({ pos: [0, R, axleZ - dist], quat: qX, teeth: 12, module, width: 0.03, mount: power.id }));
  if (withEngine) {
    // align the pinion with the engine shaft tip
    const h = 0.28 / 2 + 0.06 * 0.7;
    power.pos = [-h, R, axleZ - dist];
    pinion.pos = [0, R, axleZ - dist];
  }

  // ---- front steering: hinge (kingpin) + knuckle + stub axle + bearing + wheel ----
  const frontZ = -0.7;
  const steer = [];
  const frontBrakes = [];
  for (const side of [-1, 1]) {
    const kx = side * 0.5;
    const king = beam([kx, Y, frontZ], [kx, R, frontZ], 'bar', 0.04, 'steel');
    const stub = beam([kx, R, frontZ], [side * 0.62, R, frontZ], 'rod', 0.035, 'steel');
    link(king, stub, [kx, R, frontZ]);
    const hinge = add(Hinge.create({ pos: [kx, (Y + R) / 2, frontZ], quat: [0, 0, 0, 1], base: side < 0 ? lf.id : fr.id, moving: king.id }));
    hinge.maxAngle = 32; hinge.stiffness = 4000; hinge.damping = 200;
    const w = wheel(side * 0.6, frontZ, side);
    const br = add(Bearing.create({ pos: [side * 0.6, R, frontZ], quat: qX, base: stub.id, moving: w.id }));
    br.brake = 200;
    steer.push(hinge); frontBrakes.push(br);
  }

  // ---- seat with controls ----
  const seat = add(Seat.create({ pos: [0, Y + 0.026, 0.1], quat: [0, 0, 0, 1], base: floor.id }));
  seat.wires = [
    { to: power.id, ch: 'throttle', invert: false },
    ...steer.map((h) => ({ to: h.id, ch: 'steer', invert: false })),
    ...[brL, brR, ...frontBrakes].map((b) => ({ to: b.id, ch: 'brake', invert: false })),
  ];
  bp.changed();
  return bp;
}
