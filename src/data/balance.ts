// Central balance constants. Phase 8 tuning happens here — every number that
// shapes how the game *feels* or how matchups resolve lives in this one object.

export const BALANCE = {
  // --- Arena geometry (world units) ---
  bowlRadius: 12,
  bowlDepth: 4.4,
  ringOutRadius: 12.7,
  beyRadius: 0.95,
  beyHeight: 0.82,

  // --- Bowl physics ---
  /** Centre-pull acceleration per unit radius (the curved-bowl restoring force). */
  centerAccel: 1.02,
  /** Base linear damping applied by the floor before driver/stadium multipliers. */
  baseDamping: 0.9,
  gravity: 0,

  // --- Spin / stamina ---
  maxStamina: 100,
  /** Stamina lost per second by a neutral bey, before part/stadium multipliers. */
  baseDrainPerSec: 4.0,
  /** Extra drain per (unit/s) of movement speed — moving costs spin everywhere. */
  movementDrainK: 0.075,
  /** Below this stamina the bey wobbles; visual precession ramps in. */
  wobbleThreshold: 28,

  // --- Combat ---
  /** Master collision damage scalar. */
  collisionK: 0.135,
  /** Master knockback impulse scalar. */
  knockbackK: 1.05,
  /** Minimum relative speed for a hit to register damage. */
  minHitSpeed: 1.4,
  /** Seconds a pair is immune to re-registering a hit. */
  collisionCooldown: 0.13,
  /** Restitution on the bey colliders (Rapier-resolved bounce). */
  restitution: 0.42,

  // --- Burst ---
  burstMeterMax: 100,
  /** Burst meter gained per point of damage taken. */
  burstK: 0.78,
  /** Burst meter bled off per second when not being hit. */
  burstDecayPerSec: 3.2,

  // --- Launch ---
  launchSpeedMin: 4.5,
  launchSpeedMax: 18,
  /** Bonus starting stamina from a perfect-power launch. */
  launchStaminaBonus: 9,
  /** Penalty for a weak launch (under-charged tops spin out early). */
  launchWeakPenalty: 7,
  /** Seconds of hold to reach full charge. */
  chargeTime: 1.15,
  /** Launch radius — how far from centre beys start. */
  launchRadius: 8.2,

  // --- Special move ---
  specialMeterMax: 100,
  specialGainPerSec: 7.5,
  specialGainPerHitDealt: 13,
  specialGainPerHitTaken: 9,
  specialDuration: 2.6,

  // --- Camera ---
  cameraShakeDecay: 4.2,
  cameraShakeMaxHit: 0.55,

  // --- Match flow ---
  /** Hard time limit; on expiry highest stamina wins (sudden survivor). */
  matchTimeLimit: 75,
} as const;

/** Buff sets applied while a Special move is active, keyed by driver type. */
export const SPECIALS = {
  attack: { name: 'Smash', atkMul: 1.7, speedMul: 1.45, drainMul: 1.25, kbResistAdd: 0.0, defMul: 1.0 },
  defense: { name: 'Brace', atkMul: 1.0, speedMul: 0.7, drainMul: 0.7, kbResistAdd: 0.45, defMul: 1.6 },
  stamina: { name: 'Conserve', atkMul: 1.0, speedMul: 0.85, drainMul: 0.35, kbResistAdd: 0.15, defMul: 1.15 },
  balance: { name: 'Surge', atkMul: 1.3, speedMul: 1.2, drainMul: 0.85, kbResistAdd: 0.2, defMul: 1.2 },
} as const;
