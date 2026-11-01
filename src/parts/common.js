import * as THREE from 'three';

export function shadow(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

export function mesh(geo, mat, pos = null, rot = null) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.copy(pos);
  if (rot) m.rotation.copy(rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Common field factories for the inspector. */
export const F = {
  number: (key, label, min, max, step, unit = '') => ({ key, label, type: 'number', min, max, step, unit }),
  select: (key, label, options) => ({ key, label, type: 'select', options }),
  check: (key, label) => ({ key, label, type: 'check' }),
  info: (label, fn) => ({ label, type: 'info', fn }),
};

export const MAT_FIELD = { key: 'material', label: 'Материал', type: 'material' };
