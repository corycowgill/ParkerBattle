// Shared data contracts for Spin Arena.
//
// All gameplay content (parts, stadiums, opponents) is plain data that conforms
// to these interfaces, so balancing the game means editing numbers in `src/data`
// rather than touching engine or system code.

export type DriverType = 'attack' | 'defense' | 'stamina' | 'balance';

export type StadiumKind = 'smooth' | 'spiked' | 'lava' | 'ice';

export type PartKind = 'layer' | 'disc' | 'driver';

/** Per-part geometry styles — each value gets its own distinct procedural mesh. */
export type LayerStyle = 'core' | 'blaze' | 'aegis' | 'glide' | 'storm' | 'bastion';
export type DiscStyle = 'standard' | 'light' | 'heavy' | 'wide';
export type DriverStyle = 'balance' | 'flat' | 'rubber' | 'ball' | 'guard' | 'needle' | 'orb';

/** Energy Layer — the top ring. Drives attack power and look. */
export interface EnergyLayer {
  id: string;
  name: string;
  kind: 'layer';
  /** Distinct procedural silhouette. */
  style: LayerStyle;
  /** Raw attack stat (~30 weak .. ~90 heavy hitter). */
  attack: number;
  /** Mass contribution, folded into total bey weight. */
  mass: number;
  /** Hex colour of the ring. */
  color: number;
  /** Number of blades/teeth the silhouette builds. */
  blades: number;
  cost: number;
}

/** Forge Disc — the weight in the middle. Drives stability and drain rate. */
export interface ForgeDisc {
  id: string;
  name: string;
  kind: 'disc';
  /** Distinct procedural silhouette. */
  style: DiscStyle;
  /** Physical weight (~0.6 light .. ~1.6 heavy). Affects knockback exchange. */
  weight: number;
  /** Stability stat — folded into defence and wobble resistance. */
  stability: number;
  /** Multiplier on stamina drain. <1 spins longer. */
  drainMul: number;
  cost: number;
}

/** Driver / Tip — the bottom. The strategic core: sets type + movement. */
export interface Driver {
  id: string;
  name: string;
  kind: 'driver';
  type: DriverType;
  /** Distinct procedural silhouette. */
  style: DriverStyle;
  /** Multiplier on stamina drain. Attack tips drain fast. */
  drainMul: number;
  /** Multiplier on floor damping. <1 slides, >1 grips. */
  frictionMul: number;
  /** Flat defence bonus this tip grants. */
  defBonus: number;
  /** Force pulling the bey toward its opponent. */
  seek: number;
  /** Force pulling the bey toward the bowl centre (on top of bowl gravity). */
  center: number;
  /** Random wander force magnitude. */
  wander: number;
  /** Soft cap on movement speed. */
  maxSpeed: number;
  /** Fraction of incoming knockback negated (0..1). */
  kbResist: number;
  cost: number;
}

export type Part = EnergyLayer | ForgeDisc | Driver;

/** A bey as the player assembles it — three part ids. */
export interface BeyConfig {
  layer: string;
  disc: string;
  driver: string;
}

/** Derived combat stats, computed from a BeyConfig + parts data. */
export interface BeyStats {
  attack: number;
  defense: number;
  weight: number;
  type: DriverType;
  maxStamina: number;
  drainPerSec: number;
}

/** Per-type tuning a stadium applies on top of the global type triangle. */
export interface StadiumTypeMod {
  drainMul: number;
  defMul: number;
  atkMul: number;
}

/** A stadium reshapes the type triangle through surface effects. */
export interface StadiumConfig {
  id: string;
  name: string;
  kind: StadiumKind;
  description: string;
  /** Multiplier on floor damping — low = slippery (ice). */
  floorFrictionMul: number;
  /** Multiplier on the bowl's centre-pull force — low = can't hold centre. */
  centerPullMul: number;
  /** Magnitude of random destabilising bumps (spiked). */
  bumpForce: number;
  /** Extra stamina drain proportional to movement speed (lava). */
  movementDrainMul: number;
  /** Extra stamina drain on collision contact (lava). */
  contactDrainMul: number;
  favored: DriverType | 'none';
  typeMods: Record<DriverType, StadiumTypeMod>;
  palette: {
    floor: number;
    rim: number;
    accent: number;
    fog: number;
  };
}

/** A ladder opponent. */
export interface Opponent {
  id: string;
  name: string;
  title: string;
  bey: BeyConfig;
  stadium: string;
  /** 0..1 — scales AI launch quality and reaction. */
  difficulty: number;
  reward: number;
  /** Part ids that can drop on a win. */
  drops: string[];
}

/** Persisted player progression. */
export interface SaveData {
  version: number;
  currency: number;
  unlocked: string[];
  equipped: BeyConfig;
  ladderIndex: number;
  wins: number;
  losses: number;
}

/** How a bey lost a battle. */
export type LossReason = 'spin' | 'ring-out' | 'burst' | null;

/** Outcome of one battle. */
export interface BattleResult {
  playerWon: boolean;
  reason: LossReason;
  /** Reason the *winner* won (or null on a rare double-out). */
  winReason: LossReason;
}

/** Parameters produced by the launch mini-game. */
export interface LaunchParams {
  /** 0..1 charge strength. */
  power: number;
  /** Aim direction in radians (world XZ plane). */
  angle: number;
}
