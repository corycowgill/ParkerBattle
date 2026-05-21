// Derived combat stats. A bey's three parts each feed specific numbers; this
// is the single place those rules live.

import type { BeyConfig, BeyStats } from '../core/types';
import { BALANCE } from '../data/balance';
import { getDisc, getDriver, getLayer } from '../data/parts';

export function computeStats(cfg: BeyConfig): BeyStats {
  const layer = getLayer(cfg.layer);
  const disc = getDisc(cfg.disc);
  const driver = getDriver(cfg.driver);

  return {
    attack: layer.attack,
    defense: Math.round(disc.stability * 0.7 + driver.defBonus),
    weight: Math.round((disc.weight + layer.mass * 0.55) * 100) / 100,
    type: driver.type,
    maxStamina: BALANCE.maxStamina,
    drainPerSec: Math.round(BALANCE.baseDrainPerSec * disc.drainMul * driver.drainMul * 100) / 100,
  };
}

/** Rough spin lifetime of an undisturbed bey, for UI display. */
export function estimatedSpinSeconds(stats: BeyStats): number {
  return Math.round(stats.maxStamina / stats.drainPerSec);
}

/** A single headline number for the garage screen. */
export function powerRating(stats: BeyStats): number {
  return Math.round(
    stats.attack + stats.defense * 0.9 + stats.weight * 24 + estimatedSpinSeconds(stats) * 1.7,
  );
}
