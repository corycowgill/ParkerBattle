// Player progression: currency, part unlocks, ladder position. Persisted to
// localStorage so a real return visit keeps its garage.

import type { BeyConfig, Opponent, SaveData } from '../core/types';
import { getPart, STARTER_PARTS } from '../data/parts';
import { LADDER } from '../data/ladder';

const SAVE_KEY = 'spin-arena.save.v1';
const SAVE_VERSION = 1;

export interface WinReward {
  currency: number;
  /** Part ids unlocked for the first time by this win. */
  newParts: string[];
  /** True if this win advanced the ladder. */
  advanced: boolean;
}

export class Progression {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private defaultSave(): SaveData {
    return {
      version: SAVE_VERSION,
      currency: 0,
      unlocked: [...STARTER_PARTS],
      equipped: { layer: 'layer.core', disc: 'disc.standard', driver: 'driver.balance' },
      ladderIndex: 0,
      wins: 0,
      losses: 0,
    };
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = this.defaultSave();
      const data: SaveData = {
        version: SAVE_VERSION,
        currency: typeof parsed.currency === 'number' ? parsed.currency : base.currency,
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => !!getPart(id)) : base.unlocked,
        equipped: parsed.equipped ?? base.equipped,
        ladderIndex: typeof parsed.ladderIndex === 'number' ? parsed.ladderIndex : 0,
        wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
        losses: typeof parsed.losses === 'number' ? parsed.losses : 0,
      };
      // Make sure starter parts are always owned and the equipped bey is valid.
      for (const id of STARTER_PARTS) if (!data.unlocked.includes(id)) data.unlocked.push(id);
      if (!this.configValid(data.equipped, data.unlocked)) data.equipped = base.equipped;
      return data;
    } catch {
      return this.defaultSave();
    }
  }

  private configValid(cfg: BeyConfig, unlocked: string[]): boolean {
    return (
      unlocked.includes(cfg.layer) &&
      unlocked.includes(cfg.disc) &&
      unlocked.includes(cfg.driver) &&
      getPart(cfg.layer)?.kind === 'layer' &&
      getPart(cfg.disc)?.kind === 'disc' &&
      getPart(cfg.driver)?.kind === 'driver'
    );
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or unavailable — game still playable this session */
    }
  }

  get currency(): number {
    return this.data.currency;
  }

  get wins(): number {
    return this.data.wins;
  }

  get losses(): number {
    return this.data.losses;
  }

  get ladderIndex(): number {
    return this.data.ladderIndex;
  }

  get equipped(): BeyConfig {
    return { ...this.data.equipped };
  }

  setEquipped(cfg: BeyConfig): void {
    if (this.configValid(cfg, this.data.unlocked)) {
      this.data.equipped = { ...cfg };
      this.save();
    }
  }

  get unlocked(): string[] {
    return [...this.data.unlocked];
  }

  isUnlocked(id: string): boolean {
    return this.data.unlocked.includes(id);
  }

  canAfford(cost: number): boolean {
    return this.data.currency >= cost;
  }

  /** Buy a part. Returns true on success. */
  buyPart(id: string): boolean {
    const part = getPart(id);
    if (!part || this.isUnlocked(id) || !this.canAfford(part.cost)) return false;
    this.data.currency -= part.cost;
    this.data.unlocked.push(id);
    this.save();
    return true;
  }

  /** True when every ladder opponent has been beaten. */
  get ladderComplete(): boolean {
    return this.data.ladderIndex >= LADDER.length;
  }

  recordWin(opponent: Opponent, opponentIndex: number): WinReward {
    this.data.wins += 1;
    this.data.currency += opponent.reward;

    const newParts: string[] = [];
    for (const id of opponent.drops) {
      if (!this.isUnlocked(id) && Math.random() < 0.72) {
        this.data.unlocked.push(id);
        newParts.push(id);
      }
    }

    let advanced = false;
    if (opponentIndex === this.data.ladderIndex) {
      this.data.ladderIndex += 1;
      advanced = true;
    }

    this.save();
    return { currency: opponent.reward, newParts, advanced };
  }

  recordLoss(): void {
    this.data.losses += 1;
    this.save();
  }

  reset(): void {
    this.data = this.defaultSave();
    this.save();
  }
}
