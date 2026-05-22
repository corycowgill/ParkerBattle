// BattleManager — the in-battle state machine: Launch -> Battle -> Result.
//
// It owns the two beys, the stadium, the AI, and the fixed-step simulation
// loop, plus the "feel" layer: shockwaves, combo tracking, hit-stop freeze
// frames, camera punch, and dramatic callouts.

import type { BattleResult, BeyConfig, LaunchParams, Opponent, StadiumConfig } from '../core/types';
import { BALANCE } from '../data/balance';
import { bowlSurfaceY } from '../core/arena';
import { clamp } from '../core/util';
import type * as THREE from 'three';
import type { Physics } from '../engine/Physics';
import type { Renderer } from '../engine/Renderer';
import type { Particles } from '../visuals/Particles';
import type { Audio } from '../audio/Audio';
import { Effects } from '../visuals/Effects';
import { TYPE_COLOR } from '../visuals/BeyMesh';
import { Bey } from './Bey';
import { Stadium } from './Stadium';
import { AI } from './AI';
import { resolveClash, type CombatEffects } from './Combat';

export type BattlePhase = 'launch' | 'battle' | 'result';

export type CalloutKind = 'big' | 'crit' | 'combo' | 'burst' | 'win' | 'lose';

export interface BattleOptions {
  playerConfig: BeyConfig;
  opponent: Opponent;
  enemyConfig: BeyConfig;
  stadium: StadiumConfig;
  physics: Physics;
  scene: THREE.Scene;
  renderer: Renderer;
  particles: Particles;
  audio: Audio;
}

const PLAYER_LAUNCH_ANGLE = Math.PI / 2;
const ENEMY_LAUNCH_ANGLE = -Math.PI / 2;

export class BattleManager {
  phase: BattlePhase = 'launch';
  readonly player: Bey;
  readonly enemy: Bey;
  readonly stadium: Stadium;
  result: BattleResult | null = null;

  /** Fired once, a beat after the match resolves, so the result UI can show. */
  onResolved?: (result: BattleResult) => void;
  /** Fired for every dramatic callout (combo, smash, burst finish, ...). */
  onCallout?: (text: string, kind: CalloutKind) => void;

  private readonly ai: AI;
  private readonly fx: CombatEffects;
  private readonly effects = new Effects();
  private combatCooldown = 0;
  private timeLeft = BALANCE.matchTimeLimit;
  private resultTimer = 0;
  private resolvedFired = false;

  private hitStop = 0;
  private slowMoTimer = 0;
  private comboCount = 0;
  private comboTimer = 0;

  constructor(private readonly opts: BattleOptions) {
    this.stadium = new Stadium(opts.stadium, opts.scene);
    opts.renderer.setAtmosphere(opts.stadium.palette.fog);
    opts.scene.add(this.effects.group);

    this.player = new Bey('player', opts.playerConfig, opts.physics, opts.scene, 'You');
    this.enemy = new Bey('enemy', opts.enemyConfig, opts.physics, opts.scene, opts.opponent.name);
    this.player.placeAtLaunch(PLAYER_LAUNCH_ANGLE);
    this.enemy.placeAtLaunch(ENEMY_LAUNCH_ANGLE);

    this.ai = new AI(this.enemy, this.player, opts.opponent.difficulty);

    this.fx = {
      spark: (x, y, z, i, color) =>
        opts.particles.emit(x, y, z, {
          count: 12 + Math.floor(i * 34),
          color,
          speed: 7 + i * 16,
          spread: 1.5,
          life: 0.45 + i * 0.4,
          rise: 1.8,
          drag: 3.0,
        }),
      shake: (a) => opts.renderer.addShake(a),
      clash: (i) => opts.audio.clash(i),
      shockwave: (x, y, z, i) =>
        this.effects.shockwave(x, y, z, 0xffe27a, 2.6 + i * 7),
      onHit: (impact, x, z) => this.onHit(impact, x, z),
    };

    opts.audio.startHum();
  }

  get timeRemaining(): number {
    return Math.max(0, this.timeLeft);
  }

  private callout(text: string, kind: CalloutKind): void {
    this.onCallout?.(text, kind);
  }

  // --- Player input ------------------------------------------------------

  /** Called by the launch mini-game when the player releases. */
  launchPlayer(params: LaunchParams): void {
    if (this.phase !== 'launch') return;
    this.player.launch(params.power, params.angle);
    const enemyLaunch = this.ai.chooseLaunch();
    this.enemy.launch(enemyLaunch.power, enemyLaunch.angle);
    this.phase = 'battle';

    this.opts.audio.launch(params.power);
    this.callout('LET IT RIP!', 'big');
    this.opts.renderer.punch(0.36);
    for (const bey of [this.player, this.enemy]) {
      const t = bey.body.translation();
      this.opts.particles.emit(t.x, bowlSurfaceY(bey.radius) + 0.5, t.z, {
        count: 26,
        color: TYPE_COLOR[bey.stats.type],
        speed: 13,
        spread: 0.7,
        life: 0.55,
        rise: 1.5,
        drag: 2.6,
      });
    }
  }

  /** Returns true if the Special actually fired. */
  triggerPlayerSpecial(): boolean {
    if (this.phase !== 'battle' || !this.player.triggerSpecial()) return false;
    this.opts.audio.special();
    const t = this.player.body.translation();
    const y = bowlSurfaceY(this.player.radius);
    this.effects.shockwave(t.x, y + 0.15, t.z, TYPE_COLOR[this.player.stats.type], 7, 0.5);
    this.opts.particles.emit(t.x, y + 0.7, t.z, {
      count: 36,
      color: TYPE_COLOR[this.player.stats.type],
      speed: 10,
      spread: 1.6,
      life: 0.75,
      rise: 2.6,
      drag: 2.2,
    });
    this.opts.renderer.punch(0.22);
    return true;
  }

  private onHit(impact: number, x: number, z: number): void {
    this.comboTimer = 1.3;
    this.comboCount += 1;
    if (this.comboCount >= 3) {
      this.callout(`${this.comboCount} HIT COMBO`, 'combo');
    } else if (impact > 21) {
      this.callout('CRITICAL!', 'crit');
    } else if (impact > 13) {
      this.callout('SMASH!', 'big');
    }
    if (impact > 21) {
      this.hitStop = Math.max(this.hitStop, 0.1);
      this.opts.renderer.punch(0.5);
    } else if (impact > 13) {
      this.hitStop = Math.max(this.hitStop, 0.06);
      this.opts.renderer.punch(0.28);
    }

    // Lava stadium: every meaningful clash erupts a fire pillar at contact.
    if (this.stadium.config.kind === 'lava' && impact > 6) {
      const y = bowlSurfaceY(Math.hypot(x, z));
      this.opts.particles.emit(x, y + 0.4, z, {
        count: 22, color: 0xff7a2f, speed: 5, spread: 0.45, life: 0.9, rise: 9, drag: 1.6,
      });
      this.opts.particles.emit(x, y + 0.4, z, {
        count: 14, color: 0xffd24a, speed: 3.4, spread: 0.6, life: 0.7, rise: 7, drag: 1.8,
      });
    }
  }

  // --- Fixed-step simulation --------------------------------------------

  fixedUpdate(dt: number): void {
    if (this.phase === 'launch') return;

    // Hit-stop: a brief freeze frame to sell heavy impacts.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    // Slow-mo: after a kill the battle drifts in dramatic 0.32x speed.
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= dt;
      dt = dt * 0.32;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    const playerWasAlive = this.player.alive;
    const enemyWasAlive = this.enemy.alive;
    const cfg = this.stadium.config;

    this.player.fixedUpdate(dt, this.enemy, cfg);
    this.enemy.fixedUpdate(dt, this.player, cfg);
    if (this.phase === 'battle') this.ai.update(dt);

    this.player.recordVelocity();
    this.enemy.recordVelocity();
    const contacts = this.opts.physics.step(dt);

    this.combatCooldown = Math.max(0, this.combatCooldown - dt);
    for (const c of contacts) {
      if (!c.started) continue;
      const isPair =
        (c.handleA === this.player.handle && c.handleB === this.enemy.handle) ||
        (c.handleA === this.enemy.handle && c.handleB === this.player.handle);
      if (isPair && this.combatCooldown <= 0 && this.phase === 'battle') {
        resolveClash(this.player, this.enemy, cfg, this.fx);
        this.combatCooldown = BALANCE.collisionCooldown;
      }
    }

    this.player.postStep(dt);
    this.enemy.postStep(dt);

    if (playerWasAlive && !this.player.alive) this.onDeath(this.player);
    if (enemyWasAlive && !this.enemy.alive) this.onDeath(this.enemy);

    if (this.phase === 'battle') {
      this.timeLeft -= dt;
      if (!this.player.alive || !this.enemy.alive) {
        this.finish(!this.enemy.alive && this.player.alive);
      } else if (this.timeLeft <= 0) {
        this.finishByTime();
      }
    } else if (this.phase === 'result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0 && !this.resolvedFired && this.result) {
        this.resolvedFired = true;
        this.onResolved?.(this.result);
      }
    }
  }

  private onDeath(bey: Bey): void {
    const t = bey.body.translation();
    const y = bowlSurfaceY(bey.radius) + 0.6;
    const { particles, renderer, audio } = this.opts;
    const color = TYPE_COLOR[bey.stats.type];
    // Drift into slow-mo for the kill — burst gets the longest beat.
    this.slowMoTimer = Math.max(this.slowMoTimer, bey.lossReason === 'burst' ? 0.85 : 0.55);
    if (bey.lossReason === 'burst') {
      audio.burst();
      renderer.addShake(0.55);
      renderer.punch(0.8);
      this.hitStop = Math.max(this.hitStop, 0.24);
      this.effects.blast(t.x, y, t.z, color);
      this.callout('BURST FINISH!!', 'burst');
      particles.emit(t.x, y, t.z, { count: 110, color: 0xffffff, speed: 16, spread: 1.4, life: 1.1, rise: 4, drag: 1.6 });
      particles.emit(t.x, y, t.z, { count: 70, color, speed: 11, spread: 1.5, life: 1.5, rise: 2.4, drag: 1.8 });
    } else if (bey.lossReason === 'ring-out') {
      audio.clash(0.8);
      renderer.addShake(0.36);
      renderer.punch(0.42);
      this.effects.shockwave(t.x, y - 0.4, t.z, color, 9, 0.55);
      this.callout('RING-OUT!', 'big');
      particles.emit(t.x, y, t.z, { count: 36, color: 0xc8d4ff, speed: 9, spread: 1.2, life: 0.7, rise: 1, drag: 2.5 });
    } else {
      renderer.addShake(0.18);
      this.effects.shockwave(t.x, y - 0.4, t.z, color, 6, 0.6);
      this.callout('SPIN FINISH', 'big');
    }
  }

  private finishByTime(): void {
    const playerWon = this.player.stamina >= this.enemy.stamina;
    (playerWon ? this.enemy : this.player).forfeit();
    this.finish(playerWon);
  }

  private finish(playerWon: boolean): void {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.resultTimer = 2.4;
    const winner = playerWon ? this.player : this.enemy;
    const loser = playerWon ? this.enemy : this.player;
    this.result = { playerWon, reason: loser.lossReason, winReason: loser.lossReason };
    this.opts.audio.setHum(0);
    if (playerWon) {
      this.opts.audio.win();
      this.callout('VICTORY!', 'win');
    } else {
      this.opts.audio.lose();
      this.callout('DEFEAT', 'lose');
    }

    // Winner spotlight — a sparkle fountain from the survivor.
    const wt = winner.body.translation();
    const wy = bowlSurfaceY(winner.radius);
    const wcolor = TYPE_COLOR[winner.stats.type];
    this.effects.shockwave(wt.x, wy + 0.12, wt.z, wcolor, 7, 0.85);
    this.opts.particles.emit(wt.x, wy + 0.6, wt.z, {
      count: 60, color: wcolor, speed: 4.5, spread: 0.5, life: 1.6, rise: 7, drag: 1.4,
    });
    this.opts.particles.emit(wt.x, wy + 0.6, wt.z, {
      count: 28, color: 0xffffff, speed: 6, spread: 0.6, life: 1.2, rise: 5.5, drag: 1.5,
    });
    this.opts.renderer.punch(0.45);
  }

  // --- Per-frame visual sync --------------------------------------------

  renderSync(dt: number, time: number): void {
    this.stadium.update(dt, time);
    this.player.renderSync(dt, time);
    this.enemy.renderSync(dt, time);
    this.opts.particles.update(dt);
    this.effects.update(dt);
    this.updateArc();

    if (this.phase === 'battle') {
      const energy = clamp((this.player.speed + this.enemy.speed) / 28, 0, 1);
      this.opts.audio.setHum(0.4 + energy * 0.6);
      this.emitTrail(this.player);
      this.emitTrail(this.enemy);
    }
  }

  /** Energy arc between the two beys when they're nose-to-nose. */
  private updateArc(): void {
    if (this.phase !== 'battle' || !this.player.alive || !this.enemy.alive) {
      this.effects.setArc(0, 0, 0, 0, 0, 0, 0);
      return;
    }
    const pt = this.player.body.translation();
    const et = this.enemy.body.translation();
    const d = Math.hypot(pt.x - et.x, pt.z - et.z);
    const MAX = 5;
    if (d > MAX) {
      this.effects.setArc(0, 0, 0, 0, 0, 0, 0);
      return;
    }
    const intensity = 1 - d / MAX;
    const py = bowlSurfaceY(this.player.radius) + 0.55;
    const ey = bowlSurfaceY(this.enemy.radius) + 0.55;
    this.effects.setArc(pt.x, py, pt.z, et.x, ey, et.z, intensity);
  }

  private emitTrail(bey: Bey): void {
    if (!bey.alive || bey.speed < 6.5 || Math.random() > 0.5) return;
    const t = bey.body.translation();
    this.opts.particles.emit(t.x, bowlSurfaceY(bey.radius) + 0.22, t.z, {
      count: 2,
      color: TYPE_COLOR[bey.stats.type],
      speed: 1.4,
      spread: 1.3,
      life: 0.45,
      drag: 2,
    });
  }

  dispose(): void {
    this.opts.audio.stopHum();
    this.player.dispose();
    this.enemy.dispose();
    this.stadium.dispose();
    this.effects.dispose();
  }
}
