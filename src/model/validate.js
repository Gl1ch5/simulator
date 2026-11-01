// Dry-run assembly in a throw-away physics world to report problems while building.
import * as THREE from 'three';
import { initRapier, createWorld } from '../sim/Physics.js';
import { assemble } from '../sim/Assembler.js';

export async function validate(bp) {
  if (!bp.parts.size) return { warnings: [], mass: 0, bodies: 0, meshes: [] };
  const R = await initRapier();
  const world = createWorld(R);
  const root = new THREE.Group();
  try {
    const asm = assemble(bp, world, R, root);
    return {
      warnings: asm.warnings,
      mass: asm.totalMass,
      bodies: asm.groups.size,
      joints: asm.joints.length,
      meshes: asm.meshes.map((m) => ({ a: m.a.part.id, b: m.b.part.id, ratio: m.b.radius / m.a.radius })),
      power: [...asm.powerUnits.values()].map((u) => u.spec),
    };
  } catch (e) {
    return { warnings: ['Ошибка сборки: ' + e.message], mass: 0, bodies: 0, meshes: [] };
  } finally {
    root.traverse((o) => o.geometry?.dispose());
    world.free();
  }
}
