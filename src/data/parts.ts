// Modular part catalogue. A bey is one Energy Layer + one Forge Disc + one
// Driver. Unlocks are per-part, so every new part directly widens strategy.

import type { Driver, EnergyLayer, ForgeDisc, Part } from '../core/types';

export const ENERGY_LAYERS: EnergyLayer[] = [
  { id: 'layer.core', name: 'Core', kind: 'layer', style: 'core', attack: 52, mass: 0.42, color: 0x9aa6c4, blades: 3, cost: 0 },
  { id: 'layer.blaze', name: 'Blaze', kind: 'layer', style: 'blaze', attack: 72, mass: 0.40, color: 0xff5a36, blades: 5, cost: 0 },
  { id: 'layer.aegis', name: 'Aegis', kind: 'layer', style: 'aegis', attack: 44, mass: 0.62, color: 0x3f9bff, blades: 10, cost: 0 },
  { id: 'layer.glide', name: 'Glide', kind: 'layer', style: 'glide', attack: 38, mass: 0.30, color: 0x49e6a4, blades: 3, cost: 0 },
  { id: 'layer.storm', name: 'Storm', kind: 'layer', style: 'storm', attack: 88, mass: 0.50, color: 0xb05cff, blades: 6, cost: 0 },
  { id: 'layer.bastion', name: 'Bastion', kind: 'layer', style: 'bastion', attack: 41, mass: 0.82, color: 0x18c4c8, blades: 8, cost: 0 },
];

export const FORGE_DISCS: ForgeDisc[] = [
  { id: 'disc.standard', name: 'Standard', kind: 'disc', style: 'standard', weight: 1.0, stability: 55, drainMul: 1.0, cost: 0 },
  { id: 'disc.light', name: 'Light', kind: 'disc', style: 'light', weight: 0.62, stability: 34, drainMul: 1.06, cost: 0 },
  { id: 'disc.heavy', name: 'Heavy', kind: 'disc', style: 'heavy', weight: 1.5, stability: 80, drainMul: 0.93, cost: 0 },
  { id: 'disc.wide', name: 'Wide Guard', kind: 'disc', style: 'wide', weight: 1.24, stability: 72, drainMul: 0.86, cost: 0 },
];

export const DRIVERS: Driver[] = [
  {
    id: 'driver.balance', name: 'Balance', kind: 'driver', type: 'balance', style: 'balance',
    drainMul: 1.0, frictionMul: 1.0, defBonus: 12,
    seek: 6.5, center: 4.5, wander: 3.0, maxSpeed: 9.5, kbResist: 0.16, cost: 0,
  },
  {
    id: 'driver.flat', name: 'Flat', kind: 'driver', type: 'attack', style: 'flat',
    drainMul: 1.34, frictionMul: 0.62, defBonus: 0,
    seek: 16, center: 1.2, wander: 8, maxSpeed: 16, kbResist: 0.05, cost: 0,
  },
  {
    id: 'driver.rubber', name: 'Rubber Flat', kind: 'driver', type: 'attack', style: 'rubber',
    drainMul: 1.52, frictionMul: 0.55, defBonus: 0,
    seek: 20, center: 0.6, wander: 11, maxSpeed: 18.5, kbResist: 0.0, cost: 0,
  },
  {
    id: 'driver.ball', name: 'Ball', kind: 'driver', type: 'defense', style: 'ball',
    drainMul: 0.9, frictionMul: 1.2, defBonus: 30,
    seek: 2.2, center: 7.5, wander: 1.2, maxSpeed: 5.2, kbResist: 0.46, cost: 0,
  },
  {
    id: 'driver.guard', name: 'Defense Guard', kind: 'driver', type: 'defense', style: 'guard',
    drainMul: 0.85, frictionMul: 1.32, defBonus: 42,
    seek: 1.0, center: 9.5, wander: 0.6, maxSpeed: 4.2, kbResist: 0.6, cost: 0,
  },
  {
    id: 'driver.needle', name: 'Needle', kind: 'driver', type: 'stamina', style: 'needle',
    drainMul: 0.72, frictionMul: 1.18, defBonus: 18,
    seek: 1.0, center: 11, wander: 0.5, maxSpeed: 4.0, kbResist: 0.3, cost: 0,
  },
  {
    id: 'driver.orb', name: 'Orb', kind: 'driver', type: 'stamina', style: 'orb',
    drainMul: 0.6, frictionMul: 1.24, defBonus: 22,
    seek: 0.6, center: 12.5, wander: 0.35, maxSpeed: 3.6, kbResist: 0.34, cost: 0,
  },
];

// --- Lookup helpers -------------------------------------------------------

const LAYER_MAP = new Map(ENERGY_LAYERS.map((p) => [p.id, p]));
const DISC_MAP = new Map(FORGE_DISCS.map((p) => [p.id, p]));
const DRIVER_MAP = new Map(DRIVERS.map((p) => [p.id, p]));
const ALL_MAP = new Map<string, Part>([...LAYER_MAP, ...DISC_MAP, ...DRIVER_MAP]);

export function getLayer(id: string): EnergyLayer {
  const p = LAYER_MAP.get(id);
  if (!p) throw new Error(`Unknown energy layer: ${id}`);
  return p;
}

export function getDisc(id: string): ForgeDisc {
  const p = DISC_MAP.get(id);
  if (!p) throw new Error(`Unknown forge disc: ${id}`);
  return p;
}

export function getDriver(id: string): Driver {
  const p = DRIVER_MAP.get(id);
  if (!p) throw new Error(`Unknown driver: ${id}`);
  return p;
}

export function getPart(id: string): Part | undefined {
  return ALL_MAP.get(id);
}

export const ALL_PART_IDS: string[] = [...ALL_MAP.keys()];

/** Every part is free, so every part is unlocked from the start. */
export const STARTER_PARTS: string[] = ALL_PART_IDS;
