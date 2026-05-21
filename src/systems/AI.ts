// Opponent AI. Per the §5 decision, battles are launch-only + one Special tap,
// so the AI has exactly two jobs: pick a launch, and time its Special. There is
// no live steering — the driver profile drives in-battle movement for everyone.

import type { LaunchParams } from '../core/types';
import { clamp, lerp, rand } from '../core/util';
import type { Bey } from './Bey';

export class AI {
  private reactTimer: number;

  constructor(
    private readonly bey: Bey,
    private readonly opponent: Bey,
    /** 0..1 — scales launch quality and Special timing. */
    private readonly difficulty: number,
  ) {
    this.reactTimer = rand(0.2, 1.0);
  }

  /** Decide a launch: aim at the opponent, with skill-scaled error + power. */
  chooseLaunch(): LaunchParams {
    const from = this.bey.body.translation();
    const to = this.opponent.body.translation();
    let angle = Math.atan2(to.z - from.z, to.x - from.x);

    // Lower difficulty -> wider aim error and weaker, less consistent charge.
    const aimError = (1 - this.difficulty) * 0.9;
    angle += rand(-aimError, aimError);

    const power = clamp(lerp(0.5, 0.97, this.difficulty) + rand(-0.12, 0.12), 0.2, 1);
    return { power, angle };
  }

  /** Per-frame: time the Special move. */
  update(dt: number): void {
    if (!this.bey.alive) return;
    this.reactTimer -= dt;
    if (this.reactTimer > 0) return;
    this.reactTimer = lerp(1.9, 0.4, this.difficulty);

    if (!this.bey.specialReady) return;
    // Skilled AIs commit to a good moment; weak ones fire half-randomly.
    if (Math.random() > lerp(0.3, 0.97, this.difficulty)) return;
    if (this.isGoodSpecialMoment()) this.bey.triggerSpecial();
  }

  private isGoodSpecialMoment(): boolean {
    const a = this.bey.body.translation();
    const b = this.opponent.body.translation();
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    switch (this.bey.stats.type) {
      case 'attack':
        return dist < 5.5;
      case 'defense':
        return dist < 4.5 || this.bey.stamina < 45;
      case 'stamina':
        return this.bey.stamina < 58;
      default:
        return dist < 5.5 || this.bey.stamina < 40;
    }
  }
}
