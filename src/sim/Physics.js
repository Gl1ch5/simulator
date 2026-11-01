// Rapier world bootstrap.
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG, COLLISION } from '../core/config.js';

let ready = null;
export function initRapier() {
  if (!ready) ready = RAPIER.init().then(() => RAPIER);
  return ready;
}

export function createWorld(R) {
  const world = new R.World({ x: 0, y: CONFIG.gravity, z: 0 });
  world.timestep = 1 / CONFIG.physicsHz;
  world.numSolverIterations = 8;
  // ground: a thick static slab whose top is y = 0
  const gb = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
  world.createCollider(
    R.ColliderDesc.cuboid(2000, 1, 2000).setFriction(1.0).setRestitution(0.05).setCollisionGroups(COLLISION.WORLD),
    gb,
  );
  return world;
}
