// Global tunables. Units: metres, kilograms, seconds, radians.
export const CONFIG = {
  gridSizes: [0.05, 0.1, 0.25, 0.5, 1.0],
  defaultGrid: 0.1,
  plateThickness: 0.006,
  beamSize: 0.04,
  beamWall: 0.003,
  physicsHz: 120,
  maxSubsteps: 6,
  gravity: -9.81,
  drivetrainIterations: 12,
  snapPixels: 14,
  autosaveKey: 'forge.autosave.v1',
  settingsKey: 'forge.settings.v1',
};

export const COLLISION = {
  // membership << 16 | filter
  WORLD: (0x0001 << 16) | 0xffff,
  // vehicle parts: member of group 2, collide only with world by default
  PART_NO_SELF: (0x0002 << 16) | 0x0001,
  PART_SELF: (0x0002 << 16) | 0xffff,
  NONE: 0x00000000,
};
