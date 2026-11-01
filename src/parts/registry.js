import { Beam } from './Beam.js';
import { Shape } from './Shape.js';
import { Gear } from './Gear.js';
import { Bearing, Hinge, Spring } from './Joints.js';
import { Motor, Engine } from './Power.js';
import { Seat } from './Seat.js';
import { Differential } from './Differential.js';

export const PART_TYPES = { beam: Beam, shape: Shape, gear: Gear, bearing: Bearing, hinge: Hinge, spring: Spring, motor: Motor, engine: Engine, seat: Seat, diff: Differential };

export function typeOf(part) { return PART_TYPES[part.type]; }

export const TYPE_NAMES = {
  beam: 'Балка', shape: 'Пластина', gear: 'Шестерня', bearing: 'Подшипник', hinge: 'Шарнир',
  spring: 'Амортизатор', diff: 'Дифференциал', motor: 'Электромотор', engine: 'ДВС', seat: 'Сиденье/пульт',
};

export function partName(p) {
  if (p.type === 'shape') {
    if (p.circle) return Math.abs(p.depth) > 0.03 ? (p.material === 'rubber' ? 'Колесо' : 'Цилиндр') : 'Диск';
    return Math.abs(p.depth) > 0.03 ? 'Призма' : 'Пластина';
  }
  return TYPE_NAMES[p.type] || p.type;
}
