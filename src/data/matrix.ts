// The type triangle: Attack > Stamina > Defense > Attack.
// Balance is neutral against everything (and everything is neutral to it).
// Stadiums further reshape outcomes via their `typeMods` — see stadiums.ts.

import type { DriverType } from '../core/types';

const ADVANTAGE = 1.25;
const DISADVANTAGE = 0.8;
const NEUTRAL = 1.0;

/** What `attacker` beats. */
const BEATS: Record<DriverType, DriverType | null> = {
  attack: 'stamina',
  stamina: 'defense',
  defense: 'attack',
  balance: null,
};

/**
 * Damage multiplier when `attacker` hits `defender`, from the type triangle
 * alone. Returns 1.0 for any matchup involving a Balance bey.
 */
export function typeAdvantage(attacker: DriverType, defender: DriverType): number {
  if (attacker === 'balance' || defender === 'balance') return NEUTRAL;
  if (BEATS[attacker] === defender) return ADVANTAGE;
  if (BEATS[defender] === attacker) return DISADVANTAGE;
  return NEUTRAL;
}

/** Human-readable matchup label, for UI tooltips. */
export function matchupLabel(attacker: DriverType, defender: DriverType): string {
  const m = typeAdvantage(attacker, defender);
  if (m > 1) return 'Advantage';
  if (m < 1) return 'Disadvantage';
  return 'Even';
}
