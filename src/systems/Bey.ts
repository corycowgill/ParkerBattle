// The Bey entity — the hybrid model in one class.
//
//  * Rapier rigid body  -> translational motion, collisions, the clash bounce.
//  * This stat layer    -> spin / stamina / attack / defense / burst.
//
// "Spinning forever" is the `stamina` number ticking down; the visible spin
// rate is derived from it. Rotation is locked on the body while alive, so a
// loss simply means releasing that constraint and letting the mesh topple.

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { BeyConfig, BeyStats, Driver, LossReason, StadiumConfig } from '../core/types';
import { BALANCE, SPECIALS } from '../data/balance';
import { getDriver, getDisc, getLayer } from '../data/parts';
import { bowlSlopeAngle, bowlSurfaceY } from '../core/arena';
import { clamp, lerp, rand, remap, TAU } from '../core/util';
import { computeStats } from './Stats';
import { buildBey, TYPE_COLOR, type BeyVisual } from '../visuals/BeyMesh';
import { TrailRibbon } from '../visuals/TrailRibbon';
import type { Physics } from '../engine/Physics';

export type BeySide = 'player' | 'enemy';

/** Distance from the bey's mesh origin down to the tip. */
const TIP_OFFSET = 0.5;

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export class Bey {
  readonly side: BeySide;
  readonly config: BeyConfig;
  readonly stats: BeyStats;
  readonly driver: Driver;
  readonly visual: BeyVisual;
  readonly body: RAPIER.RigidBody;
  readonly handle: number;
  readonly label: string;

  stamina: number;
  burstMeter = 0;
  specialMeter = 0;
  alive = true;
  launched = false;
  lossReason: LossReason = null;
  specialActive = false;

  /** Pair-collision debounce, ticked down by the battle loop. */
  hitCooldown = 0;

  /** Velocity snapshot from just before the last physics step — Combat reads
   *  this so damage uses the true impact speed, not the post-bounce speed. */
  readonly prevVel = { x: 0, z: 0 };

  private specialTimer = 0;
  private wanderAngle = Math.random() * TAU;
  private bumpTimer = rand(0.2, 0.6);
  private wobblePhase = Math.random() * TAU;
  private spinAngle = Math.random() * TAU;
  private toppleT = 0;
  private toppleDir = 0;
  private spawnAngle = 0;
  private readonly spinSign: number;

  private readonly scene: THREE.Scene;
  private readonly physics: Physics;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly trail: TrailRibbon;
  private readonly debris: Debris[] = [];

  private readonly impulse = new THREE.Vector2();

  constructor(side: BeySide, config: BeyConfig, physics: Physics, scene: THREE.Scene, label: string) {
    this.side = side;
    this.config = config;
    this.label = label;
    this.scene = scene;
    this.physics = physics;
    this.stats = computeStats(config);
    this.driver = getDriver(config.driver);
    this.stamina = this.stats.maxStamina;
    this.spinSign = side === 'player' ? 1 : -1;

    this.visual = buildBey(getLayer(config.layer), getDisc(config.disc), this.driver);
    scene.add(this.visual.root);

    this.body = physics.createBeyBody({
      x: 0,
      z: 0,
      radius: BALANCE.beyRadius,
      halfHeight: BALANCE.beyHeight / 2,
      mass: this.stats.weight,
      restitution: BALANCE.restitution,
    });
    this.handle = this.body.handle;

    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALANCE.beyRadius * 1.5, 22), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.trail = new TrailRibbon(TYPE_COLOR[this.stats.type], 0.36);
    scene.add(this.trail.mesh);
  }

  // --- Position / motion accessors ---------------------------------------

  get x(): number {
    return this.body.translation().x;
  }

  get z(): number {
    return this.body.translation().z;
  }

  get radius(): number {
    const t = this.body.translation();
    return Math.hypot(t.x, t.z);
  }

  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.z);
  }

  // --- Effective (buffed) stats ------------------------------------------

  private get specialSet() {
    return SPECIALS[this.stats.type];
  }

  effectiveAttack(stadium: StadiumConfig): number {
    const mul = stadium.typeMods[this.stats.type].atkMul * (this.specialActive ? this.specialSet.atkMul : 1);
    return this.stats.attack * mul;
  }

  effectiveDefense(stadium: StadiumConfig): number {
    const mul = stadium.typeMods[this.stats.type].defMul * (this.specialActive ? this.specialSet.defMul : 1);
    return this.stats.defense * mul;
  }

  /** Fraction of incoming knockback negated (0..0.88). */
  knockbackResist(): number {
    const special = this.specialActive ? this.specialSet.kbResistAdd : 0;
    return clamp(this.driver.kbResist + special + this.stats.defense * 0.0022, 0, 0.88);
  }

  // --- Launch ------------------------------------------------------------

  /** Park the bey above its launch spot before the player charges up. */
  placeAtLaunch(angle: number): void {
    this.spawnAngle = angle;
    const x = Math.cos(angle) * BALANCE.launchRadius;
    const z = Math.sin(angle) * BALANCE.launchRadius;
    this.body.setTranslation({ x, y: 0, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.launched = false;
  }

  /** Fire the bey into the bowl. */
  launch(power: number, angle: number): void {
    const speed = lerp(BALANCE.launchSpeedMin, BALANCE.launchSpeedMax, clamp(power, 0, 1));
    this.body.setLinvel({ x: Math.cos(angle) * speed, y: 0, z: Math.sin(angle) * speed }, true);
    this.stamina = this.stats.maxStamina - BALANCE.launchWeakPenalty * (1 - clamp(power, 0, 1));
    this.launched = true;
    const t = this.body.translation();
    this.trail.reset(t.x, t.z);
  }

  // --- Fixed-step simulation --------------------------------------------

  /** Snapshot velocity before the physics step (see `prevVel`). */
  recordVelocity(): void {
    const v = this.body.linvel();
    this.prevVel.x = v.x;
    this.prevVel.z = v.z;
  }

  /** Before the physics step: apply driver forces, drain stamina, tick buffs. */
  fixedUpdate(dt: number, opponent: Bey, stadium: StadiumConfig): void {
    if (!this.launched) return;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (!this.alive) return;

    this.applyForces(dt, opponent, stadium);
    this.drain(dt, stadium);
    if (this.specialActive) {
      this.specialTimer -= dt;
      if (this.specialTimer <= 0) this.specialActive = false;
    }
    this.specialMeter = Math.min(BALANCE.specialMeterMax, this.specialMeter + BALANCE.specialGainPerSec * dt);
  }

  /** After the physics step: positions are final, so resolve loss conditions. */
  postStep(dt: number): void {
    if (!this.launched) return;
    if (this.alive) {
      this.checkLoss();
    } else if (this.lossReason === 'spin') {
      this.toppleT = Math.min(1, this.toppleT + dt / 1.1);
    }
  }

  private applyForces(dt: number, opponent: Bey, stadium: StadiumConfig): void {
    const t = this.body.translation();
    const r = Math.hypot(t.x, t.z) || 0.0001;
    const speedMul = this.specialActive ? this.specialSet.speedMul : 1;

    this.body.setLinearDamping(BALANCE.baseDamping * stadium.floorFrictionMul * this.driver.frictionMul);

    this.impulse.set(0, 0);
    const mass = this.body.mass();

    // Curved-bowl restoring force — pulls every bey back toward the centre.
    const centerAcc = BALANCE.centerAccel * r * stadium.centerPullMul;
    this.impulse.x += (-t.x / r) * mass * centerAcc * dt;
    this.impulse.y += (-t.z / r) * mass * centerAcc * dt;

    // Driver: extra centre hug (grows with distance from centre).
    const hug = this.driver.center * (r / BALANCE.bowlRadius) * dt;
    this.impulse.x += (-t.x / r) * hug;
    this.impulse.y += (-t.z / r) * hug;

    // Driver: seek the opponent.
    const ot = opponent.body.translation();
    const dx = ot.x - t.x;
    const dz = ot.z - t.z;
    const od = Math.hypot(dx, dz) || 0.0001;
    const seek = this.driver.seek * speedMul * dt;
    this.impulse.x += (dx / od) * seek;
    this.impulse.y += (dz / od) * seek;

    // Driver: random wander.
    this.wanderAngle += rand(-2.6, 2.6) * dt;
    const wander = this.driver.wander * dt;
    this.impulse.x += Math.cos(this.wanderAngle) * wander;
    this.impulse.y += Math.sin(this.wanderAngle) * wander;

    // Stadium: random destabilising bumps (Spiked Pit).
    if (stadium.bumpForce > 0) {
      this.bumpTimer -= dt;
      if (this.bumpTimer <= 0) {
        this.bumpTimer = rand(0.3, 0.7);
        const v = this.body.linvel();
        const moving = Math.min(Math.hypot(v.x, v.z) / 7, 1.4);
        const mag = stadium.bumpForce * (0.4 + moving);
        const a = Math.random() * TAU;
        this.body.applyImpulse({ x: Math.cos(a) * mag, y: 0, z: Math.sin(a) * mag }, true);
      }
    }

    this.body.applyImpulse({ x: this.impulse.x, y: 0, z: this.impulse.y }, true);
  }

  private drain(dt: number, stadium: StadiumConfig): void {
    const typeMod = stadium.typeMods[this.stats.type];
    const specialDrain = this.specialActive ? this.specialSet.drainMul : 1;
    let drain = this.stats.drainPerSec * typeMod.drainMul * specialDrain;
    drain += BALANCE.movementDrainK * this.speed * stadium.movementDrainMul;
    this.stamina -= drain * dt;
    this.burstMeter = Math.max(0, this.burstMeter - BALANCE.burstDecayPerSec * dt);
  }

  private checkLoss(): void {
    if (this.burstMeter >= BALANCE.burstMeterMax) {
      this.die('burst');
    } else if (this.stamina <= 0) {
      this.stamina = 0;
      this.die('spin');
    } else if (this.radius > BALANCE.ringOutRadius) {
      this.die('ring-out');
    }
  }

  private die(reason: LossReason): void {
    if (!this.alive) return;
    this.alive = false;
    this.lossReason = reason;
    this.specialActive = false;
    if (reason === 'spin' || reason === 'ring-out') {
      const t = this.body.translation();
      this.toppleDir = Math.atan2(t.z, t.x);
    }
    if (reason === 'burst') this.shatter();
  }

  /** Lose immediately — used by the match-timer sudden-survivor rule. */
  forfeit(): void {
    this.die('spin');
  }

  // --- Combat hooks (called by Combat.ts) --------------------------------

  takeDamage(amount: number, burstAdd: number): void {
    this.stamina -= amount;
    this.burstMeter = Math.min(BALANCE.burstMeterMax + 1, this.burstMeter + burstAdd);
  }

  push(ix: number, iz: number): void {
    this.body.applyImpulse({ x: ix, y: 0, z: iz }, true);
  }

  gainSpecial(amount: number): void {
    this.specialMeter = Math.min(BALANCE.specialMeterMax, this.specialMeter + amount);
  }

  /** Returns true if the special actually fired. */
  triggerSpecial(): boolean {
    if (!this.alive || this.specialMeter < BALANCE.specialMeterMax) return false;
    this.specialMeter = 0;
    this.specialActive = true;
    this.specialTimer = BALANCE.specialDuration;
    return true;
  }

  get specialReady(): boolean {
    return this.alive && this.specialMeter >= BALANCE.specialMeterMax;
  }

  // --- Burst -------------------------------------------------------------

  private shatter(): void {
    const parts = [this.visual.layer, this.visual.disc, this.visual.driver];
    for (const part of parts) {
      const worldPos = new THREE.Vector3();
      part.getWorldPosition(worldPos);
      this.visual.spinner.remove(part);
      this.scene.add(part);
      part.position.copy(worldPos);
      this.debris.push({
        obj: part,
        vel: new THREE.Vector3(rand(-6, 6), rand(5, 10), rand(-6, 6)),
        spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
        life: 2.4,
      });
    }
    this.visual.root.visible = false;
  }

  // --- Per-frame visual sync --------------------------------------------

  renderSync(dt: number, time: number): void {
    this.updateDebris(dt);

    const t = this.body.translation();
    const r = Math.hypot(t.x, t.z);
    const root = this.visual.root;

    if (!this.launched) {
      const lx = Math.cos(this.spawnAngle) * BALANCE.launchRadius;
      const lz = Math.sin(this.spawnAngle) * BALANCE.launchRadius;
      root.position.set(lx, bowlSurfaceY(BALANCE.launchRadius) + TIP_OFFSET + 2.4 + Math.sin(time * 2) * 0.16, lz);
      root.rotation.set(0, 0, 0);
      this.visual.spinner.rotation.y += dt * 6 * this.spinSign;
      this.shadow.visible = false;
      this.visual.auraMat.opacity = 0.4 + Math.sin(time * 3) * 0.08;
      this.visual.aura.scale.setScalar(2.5);
      this.trail.hide();
      return;
    }

    root.position.set(t.x, bowlSurfaceY(r) + TIP_OFFSET, t.z);

    // Spin rate is derived from stamina, not angular momentum.
    let spinRate: number;
    if (this.alive) {
      spinRate = lerp(3, 30, clamp(this.stamina / this.stats.maxStamina, 0, 1));
    } else if (this.lossReason === 'spin') {
      spinRate = lerp(8, 0, this.toppleT);
    } else {
      spinRate = 6;
    }
    this.spinAngle += spinRate * dt * this.spinSign;
    this.visual.spinner.rotation.y = this.spinAngle;

    // Lean outward on the bowl wall.
    const lean = bowlSlopeAngle(r) * 0.4;
    let tiltX = (r > 0.001 ? t.z / r : 0) * lean;
    let tiltZ = (r > 0.001 ? -t.x / r : 0) * lean;

    if (this.alive && this.stamina < BALANCE.wobbleThreshold) {
      // Fake gyroscopic precession as stamina runs low.
      const amp = remap(this.stamina, BALANCE.wobbleThreshold, 0, 0, 0.4);
      this.wobblePhase += dt * (4 + (1 - this.stamina / BALANCE.wobbleThreshold) * 7);
      tiltX += Math.cos(this.wobblePhase) * amp;
      tiltZ += Math.sin(this.wobblePhase) * amp;
    }

    if (!this.alive && this.lossReason === 'spin') {
      const fall = (1 - Math.cos(this.toppleT * Math.PI)) * 0.5 * 1.5;
      tiltX += Math.cos(this.toppleDir) * fall;
      tiltZ += Math.sin(this.toppleDir) * fall;
    }
    root.rotation.set(tiltX, 0, tiltZ);

    // Shadow.
    this.shadow.visible = this.visual.root.visible;
    this.shadow.position.set(t.x, bowlSurfaceY(r) + 0.03, t.z);
    const shrink = this.alive ? 1 : 1 - this.toppleT * 0.5;
    this.shadow.scale.setScalar(shrink);
    this.shadowMat.opacity = 0.34 * shrink;

    // Accent glow — brighter while spinning fast or special is active.
    const spinE = clamp(this.stamina / this.stats.maxStamina, 0, 1);
    let glow = lerp(0.35, 2.1, spinE);
    if (this.specialActive) glow += 1.6 + Math.sin(time * 22) * 0.6;
    if (!this.alive) glow *= 0.3;
    this.visual.accent.emissiveIntensity = glow;

    // Spinning-energy aura — pulses with spin speed + Special.
    const speedE = clamp(this.speed / 12, 0, 1);
    let auraOpacity = this.alive ? 0.22 + spinE * 0.34 + speedE * 0.32 : 0.06;
    let auraScale = 2.15 + speedE * 1.5;
    if (this.specialActive) {
      auraOpacity = Math.min(1, auraOpacity * 1.7);
      auraScale += 0.9;
    }
    this.visual.auraMat.opacity = auraOpacity;
    this.visual.aura.scale.setScalar(auraScale);

    if (this.alive) this.trail.push(t.x, t.z);
    else this.trail.hide();
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 22 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.life < 0.6) d.obj.scale.setScalar(Math.max(0, d.life / 0.6));
      if (d.life <= 0) {
        this.scene.remove(d.obj);
        this.debris.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.physics.removeBody(this.body);
    this.scene.remove(this.visual.root);
    this.scene.remove(this.shadow);
    this.scene.remove(this.trail.mesh);
    for (const d of this.debris) this.scene.remove(d.obj);
    this.debris.length = 0;
    this.visual.dispose();
    this.shadow.geometry.dispose();
    this.shadowMat.dispose();
    this.trail.dispose();
  }
}
