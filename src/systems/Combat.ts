// Collision resolution — the §4 stat & win model.
//
// Rapier supplies the bounce; this layer adds the *game* hit: stamina damage,
// stat-scaled knockback, burst-meter fill, and special-meter gain. Damage uses
// the pre-step impact speed (Bey.prevVel) so a clash hits as hard as it looked.

import type { StadiumConfig } from '../core/types';
import { BALANCE } from '../data/balance';
import { typeAdvantage } from '../data/matrix';
import { clamp } from '../core/util';
import { bowlSurfaceY } from '../core/arena';
import type { Bey } from './Bey';

export interface CombatEffects {
  /** Emit a clash spark burst at a world point. */
  spark(x: number, y: number, z: number, intensity: number, color: number): void;
  /** Shake the camera. */
  shake(amount: number): void;
  /** Play the clash sound. */
  clash(intensity: number): void;
  /** Spawn an expanding shockwave ring. */
  shockwave(x: number, y: number, z: number, intensity: number): void;
  /** Drama hook — combo tracking, callouts, hit-stop, camera punch. */
  onHit(impact: number, x: number, z: number): void;
}

function damage(attacker: Bey, defender: Bey, stadium: StadiumConfig, impact: number): number {
  const atk = attacker.effectiveAttack(stadium);
  const def = Math.max(1, defender.effectiveDefense(stadium));
  const adv = typeAdvantage(attacker.stats.type, defender.stats.type);
  return BALANCE.collisionK * impact * (atk / def) * adv * stadium.contactDrainMul;
}

function knockback(attacker: Bey, defender: Bey, impact: number): number {
  const ratio = attacker.stats.weight / Math.max(0.15, defender.stats.weight);
  return BALANCE.knockbackK * impact * ratio * (1 - defender.knockbackResist());
}

/**
 * Resolve a clash between two beys. Caller is responsible for the per-pair
 * cooldown — this always applies a full hit when invoked.
 */
export function resolveClash(a: Bey, b: Bey, stadium: StadiumConfig, fx: CombatEffects): void {
  const ta = a.body.translation();
  const tb = b.body.translation();
  let nx = tb.x - ta.x;
  let nz = tb.z - ta.z;
  const nd = Math.hypot(nx, nz) || 0.0001;
  nx /= nd;
  nz /= nd;

  // Impact speed from the pre-step velocities.
  const rvx = a.prevVel.x - b.prevVel.x;
  const rvz = a.prevVel.z - b.prevVel.z;
  const relSpeed = Math.hypot(rvx, rvz);
  const closing = rvx * nx + rvz * nz;
  const impact = Math.max(closing, relSpeed * 0.4);
  if (impact < BALANCE.minHitSpeed) return;

  // Per-side bias — the player gets a small built-in advantage so wins feel
  // achievable. The attacker's bias scales both their damage and knockback.
  const aBias = a.side === 'player' ? BALANCE.playerCombatBonus : BALANCE.enemyCombatBonus;
  const bBias = b.side === 'player' ? BALANCE.playerCombatBonus : BALANCE.enemyCombatBonus;

  // Mutual damage.
  const dmgToB = damage(a, b, stadium, impact) * aBias;
  const dmgToA = damage(b, a, stadium, impact) * bBias;
  b.takeDamage(dmgToB, dmgToB * BALANCE.burstK);
  a.takeDamage(dmgToA, dmgToA * BALANCE.burstK);

  // Knockback, pushing the beys apart along the contact normal.
  const kbToB = knockback(a, b, impact) * aBias;
  const kbToA = knockback(b, a, impact) * bBias;
  b.push(nx * kbToB, nz * kbToB);
  a.push(-nx * kbToA, -nz * kbToA);

  // Special meter — dealing and taking hits both build it.
  a.gainSpecial(BALANCE.specialGainPerHitDealt);
  b.gainSpecial(BALANCE.specialGainPerHitDealt);
  a.gainSpecial(BALANCE.specialGainPerHitTaken);
  b.gainSpecial(BALANCE.specialGainPerHitTaken);

  // Effects.
  const intensity = clamp(impact / 22, 0.16, 1);
  const mx = (ta.x + tb.x) / 2;
  const mz = (ta.z + tb.z) / 2;
  const surfaceY = bowlSurfaceY(Math.hypot(mx, mz));
  fx.spark(mx, surfaceY + 0.65, mz, intensity, 0xffe27a);
  fx.clash(intensity);
  fx.shake(intensity * 0.5);
  fx.shockwave(mx, surfaceY + 0.12, mz, intensity);
  fx.onHit(impact, mx, mz);
}
