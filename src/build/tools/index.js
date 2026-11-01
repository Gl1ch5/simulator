import { SelectTool } from './SelectTool.js';
import { BeamTool } from './BeamTool.js';
import { RectTool, PolygonTool, CircleTool } from './PlateTools.js';
import { ExtrudeTool } from './ExtrudeTool.js';
import { ConnectTool, WireTool } from './LinkTools.js';
import { makeJointTools } from './JointTools.js';
import { GearTool, MotorTool, EngineTool, SeatTool } from './MountTools.js';
import { PaintTool, DeleteTool } from './EditTools.js';
import { DiffTool } from './DiffTool.js';

export function createTools(build) {
  return {
    select: new SelectTool(build),
    beam: new BeamTool(build),
    rect: new RectTool(build),
    polygon: new PolygonTool(build),
    circle: new CircleTool(build),
    extrude: new ExtrudeTool(build),
    connect: new ConnectTool(build),
    ...makeJointTools(build),
    gear: new GearTool(build),
    diff: new DiffTool(build),
    motor: new MotorTool(build),
    engine: new EngineTool(build),
    seat: new SeatTool(build),
    wire: new WireTool(build),
    paint: new PaintTool(build),
    delete: new DeleteTool(build),
  };
}

export const TOOL_GROUPS = [
  { title: 'Правка', tools: ['select', 'delete', 'paint'] },
  { title: 'Геометрия', tools: ['beam', 'rect', 'polygon', 'circle', 'extrude'] },
  { title: 'Механика', tools: ['connect', 'bearing', 'hinge', 'spring', 'gear', 'diff'] },
  { title: 'Силовые', tools: ['motor', 'engine'] },
  { title: 'Управление', tools: ['seat', 'wire'] },
];
