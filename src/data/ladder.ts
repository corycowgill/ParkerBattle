// The opponent ladder. Each rung favours a different stadium, forcing the
// player to re-spec their bey and so *teaching* the matchup matrix by play.

import type { Opponent } from '../core/types';

export const LADDER: Opponent[] = [
  {
    id: 'op.rook',
    name: 'Rookie Remy',
    title: 'The Beginner',
    bey: { layer: 'layer.core', disc: 'disc.standard', driver: 'driver.balance' },
    stadium: 'stadium.smooth',
    difficulty: 0.18,
    reward: 90,
    drops: ['disc.light'],
  },
  {
    id: 'op.dash',
    name: 'Dash Kano',
    title: 'The Rusher',
    bey: { layer: 'layer.blaze', disc: 'disc.light', driver: 'driver.flat' },
    stadium: 'stadium.ice',
    difficulty: 0.34,
    reward: 130,
    drops: ['driver.flat', 'layer.blaze'],
  },
  {
    id: 'op.terra',
    name: 'Terra Vault',
    title: 'The Wall',
    bey: { layer: 'layer.aegis', disc: 'disc.heavy', driver: 'driver.ball' },
    stadium: 'stadium.lava',
    difficulty: 0.48,
    reward: 170,
    drops: ['driver.ball', 'disc.heavy'],
  },
  {
    id: 'op.sage',
    name: 'Sage Yui',
    title: 'The Patient',
    bey: { layer: 'layer.glide', disc: 'disc.standard', driver: 'driver.needle' },
    stadium: 'stadium.spiked',
    difficulty: 0.6,
    reward: 210,
    drops: ['driver.needle', 'layer.glide'],
  },
  {
    id: 'op.volt',
    name: 'Volt Reaper',
    title: 'The Predator',
    bey: { layer: 'layer.blaze', disc: 'disc.heavy', driver: 'driver.rubber' },
    stadium: 'stadium.ice',
    difficulty: 0.72,
    reward: 280,
    drops: ['driver.rubber'],
  },
  {
    id: 'op.atlas',
    name: 'Atlas Prime',
    title: 'The Fortress',
    bey: { layer: 'layer.bastion', disc: 'disc.wide', driver: 'driver.guard' },
    stadium: 'stadium.lava',
    difficulty: 0.82,
    reward: 340,
    drops: ['driver.guard', 'layer.bastion'],
  },
  {
    id: 'op.nova',
    name: 'Nova Eclipse',
    title: 'The Endless',
    bey: { layer: 'layer.glide', disc: 'disc.wide', driver: 'driver.orb' },
    stadium: 'stadium.spiked',
    difficulty: 0.9,
    reward: 420,
    drops: ['driver.orb', 'disc.wide'],
  },
  {
    id: 'op.champion',
    name: 'Champion Kael',
    title: 'Arena Master',
    bey: { layer: 'layer.storm', disc: 'disc.heavy', driver: 'driver.balance' },
    stadium: 'stadium.smooth',
    difficulty: 1.0,
    reward: 700,
    drops: ['layer.storm'],
  },
];

export function ladderOpponent(index: number): Opponent | undefined {
  return LADDER[index];
}
