// Visual (render) materials matching the physical material library.
import * as THREE from 'three';
import { MATERIALS } from '../model/materials.js';
import { brushedTexture, woodTexture, carbonTexture, rubberTexture } from './textures.js';

const cache = new Map();

export function visualMaterial(key, overrides = null) {
  const id = key + (overrides ? JSON.stringify(overrides) : '');
  if (cache.has(id)) return cache.get(id);
  const m = MATERIALS[key] || MATERIALS.steel;
  const mat = new THREE.MeshPhysicalMaterial({
    color: m.color,
    metalness: m.metalness,
    roughness: m.roughness,
    clearcoat: m.clearcoat || 0,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.0,
  });
  if (m.brushed) { mat.roughnessMap = brushedTexture(); mat.bumpMap = brushedTexture(); mat.bumpScale = 0.15; }
  if (m.wood) { mat.map = woodTexture(); mat.color.set(0xffffff); }
  if (m.carbon) { mat.map = carbonTexture(); mat.color.set(0xffffff); }
  if (m.rubber) { mat.bumpMap = rubberTexture(); mat.bumpScale = 0.4; }
  if (overrides) Object.assign(mat, overrides);
  cache.set(id, mat);
  return mat;
}

const special = new Map();
/** Fixed materials for machine components (motor housings, copper, etc.). */
export function componentMaterial(kind) {
  if (special.has(kind)) return special.get(kind);
  let mat;
  switch (kind) {
    case 'motorBody': mat = new THREE.MeshPhysicalMaterial({ color: 0x1f6fd1, metalness: 0.45, roughness: 0.32, clearcoat: 0.8 }); break;
    case 'motorCap': mat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.35 }); break;
    case 'engineBlock': mat = new THREE.MeshPhysicalMaterial({ color: 0x3a3f46, metalness: 0.85, roughness: 0.45 }); break;
    case 'engineHead': mat = new THREE.MeshPhysicalMaterial({ color: 0xc23b22, metalness: 0.4, roughness: 0.3, clearcoat: 1 }); break;
    case 'chrome': mat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 1, roughness: 0.08 }); break;
    case 'darkSteel': mat = new THREE.MeshStandardMaterial({ color: 0x40444b, metalness: 0.9, roughness: 0.4 }); break;
    case 'brass': mat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28 }); break;
    case 'copper': mat = new THREE.MeshStandardMaterial({ color: 0xc46a3a, metalness: 1, roughness: 0.3 }); break;
    case 'yellow': mat = new THREE.MeshPhysicalMaterial({ color: 0xf2b417, metalness: 0.2, roughness: 0.4, clearcoat: 0.6 }); break;
    case 'seat': mat = new THREE.MeshPhysicalMaterial({ color: 0x24262b, metalness: 0, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0x555555) }); break;
    case 'spring': mat = new THREE.MeshStandardMaterial({ color: 0xe0b020, metalness: 0.8, roughness: 0.3 }); break;
    case 'accentGlow': mat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00c8ff, emissiveIntensity: 2.5 }); break;
    case 'redGlow': mat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a1a, emissiveIntensity: 2.5 }); break;
    default: mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  }
  special.set(kind, mat);
  return mat;
}

export const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 0x39d0ff, transparent: true, opacity: 0.38, emissive: 0x0a5aa0, emissiveIntensity: 0.6, depthWrite: false,
});
export const ghostBadMaterial = new THREE.MeshStandardMaterial({
  color: 0xff5a4a, transparent: true, opacity: 0.4, emissive: 0x801010, emissiveIntensity: 0.6, depthWrite: false,
});
export const lineMaterial = new THREE.LineBasicMaterial({ color: 0x39d0ff, depthTest: false, transparent: true });
