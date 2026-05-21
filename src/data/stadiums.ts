// The four stadiums. Each is a pure data object: the surface effects, the
// per-type tuning, and the look. The stadium reshapes the type triangle, so
// this file *is* the heart of the game's strategy.

import type { DriverType, StadiumConfig } from '../core/types';

function typeMods(
  partial: Partial<Record<DriverType, Partial<{ drainMul: number; defMul: number; atkMul: number }>>>,
): StadiumConfig['typeMods'] {
  const base = { drainMul: 1, defMul: 1, atkMul: 1 };
  const mk = (t: DriverType) => ({ ...base, ...partial[t] });
  return { attack: mk('attack'), defense: mk('defense'), stamina: mk('stamina'), balance: mk('balance') };
}

export const STADIUMS: StadiumConfig[] = [
  {
    id: 'stadium.smooth',
    name: 'Smooth Bowl',
    kind: 'smooth',
    description: 'Neutral friction. No surface tricks — launch skill and collisions decide it.',
    floorFrictionMul: 1.0,
    centerPullMul: 1.0,
    bumpForce: 0,
    movementDrainMul: 1.0,
    contactDrainMul: 1.0,
    favored: 'none',
    typeMods: typeMods({}),
    palette: { floor: 0x2a3050, rim: 0x4a557f, accent: 0x7f8fd0, fog: 0x0a0c18 },
  },
  {
    id: 'stadium.spiked',
    name: 'Spiked Pit',
    kind: 'spiked',
    description: 'Random bumps throw beys off course. Stamina tips hug the centre and ride it out.',
    floorFrictionMul: 1.0,
    centerPullMul: 0.92,
    bumpForce: 6.4,
    movementDrainMul: 1.0,
    contactDrainMul: 1.0,
    favored: 'stamina',
    typeMods: typeMods({
      stamina: { drainMul: 0.88, defMul: 1.12 },
      attack: { drainMul: 1.16, atkMul: 0.9 },
      balance: { drainMul: 1.04 },
    }),
    palette: { floor: 0x3a2f24, rim: 0x6b5640, accent: 0xd79a4c, fog: 0x14100a },
  },
  {
    id: 'stadium.lava',
    name: 'Lava Forge',
    kind: 'lava',
    description: 'Movement and contact overheat the bey. Defence sits still and conserves.',
    floorFrictionMul: 1.08,
    centerPullMul: 1.04,
    bumpForce: 0,
    movementDrainMul: 2.5,
    contactDrainMul: 2.2,
    favored: 'defense',
    typeMods: typeMods({
      defense: { drainMul: 0.82, defMul: 1.1 },
      attack: { drainMul: 1.28, atkMul: 1.06 },
      stamina: { drainMul: 1.08 },
      balance: { drainMul: 1.05 },
    }),
    palette: { floor: 0x2a0d08, rim: 0x7a2410, accent: 0xff6a1a, fog: 0x180603 },
  },
  {
    id: 'stadium.ice',
    name: 'Ice Rink',
    kind: 'ice',
    description: 'Almost no friction. You slide to the rim — you must attack fast or slide out.',
    floorFrictionMul: 0.26,
    centerPullMul: 0.56,
    bumpForce: 0,
    movementDrainMul: 0.85,
    contactDrainMul: 1.0,
    favored: 'attack',
    typeMods: typeMods({
      attack: { drainMul: 0.9, atkMul: 1.12 },
      stamina: { defMul: 0.9, drainMul: 1.06 },
      defense: { defMul: 0.92 },
      balance: { drainMul: 1.0 },
    }),
    palette: { floor: 0x1c3550, rim: 0x4f86b8, accent: 0xa9e4ff, fog: 0x081420 },
  },
];

const STADIUM_MAP = new Map(STADIUMS.map((s) => [s.id, s]));

export function getStadium(id: string): StadiumConfig {
  const s = STADIUM_MAP.get(id);
  if (!s) throw new Error(`Unknown stadium: ${id}`);
  return s;
}
