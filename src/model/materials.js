// Physical material library. Density in kg/m^3.
export const MATERIALS = {
  steel: {
    name: 'Сталь', density: 7850, friction: 0.6, restitution: 0.1,
    color: 0x8d949c, metalness: 0.95, roughness: 0.38, brushed: true,
  },
  aluminum: {
    name: 'Алюминий', density: 2700, friction: 0.55, restitution: 0.1,
    color: 0xc9ced4, metalness: 0.95, roughness: 0.28, brushed: true,
  },
  painted: {
    name: 'Сталь крашеная', density: 7850, friction: 0.6, restitution: 0.1,
    color: 0xd2452b, metalness: 0.3, roughness: 0.35, clearcoat: 1.0,
  },
  wood: {
    name: 'Дерево', density: 650, friction: 0.7, restitution: 0.2,
    color: 0xa0703f, metalness: 0.0, roughness: 0.75, wood: true,
  },
  plastic: {
    name: 'Пластик', density: 1200, friction: 0.5, restitution: 0.3,
    color: 0x2f7bd9, metalness: 0.0, roughness: 0.45, clearcoat: 0.4,
  },
  carbon: {
    name: 'Карбон', density: 1600, friction: 0.5, restitution: 0.15,
    color: 0x1c1e22, metalness: 0.3, roughness: 0.3, clearcoat: 1.0, carbon: true,
  },
  rubber: {
    name: 'Резина', density: 1150, friction: 1.4, restitution: 0.35,
    color: 0x1b1b1d, metalness: 0.0, roughness: 0.92, rubber: true,
  },
};

export const MATERIAL_ORDER = ['steel', 'aluminum', 'painted', 'wood', 'plastic', 'carbon', 'rubber'];

export function getMaterial(key) { return MATERIALS[key] || MATERIALS.steel; }
