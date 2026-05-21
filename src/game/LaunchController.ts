// The launch mini-game (§5). One device-agnostic flow: press to charge,
// drag left/right to aim, release to launch. A fast downward flick (the
// ripcord feel on touch) adds extra power. Space-bar charges on desktop.
//
// Skill lives entirely here — power and aim are the whole input surface.

import * as THREE from 'three';
import type { LaunchParams } from '../core/types';
import type { PointerRelease } from '../engine/Input';
import { BALANCE } from '../data/balance';
import { bowlSurfaceY } from '../core/arena';
import { clamp } from '../core/util';

const AIM_SENSITIVITY = 0.0065; // radians per CSS pixel of horizontal drag

export class LaunchController {
  active = false;
  charging = false;
  power = 0;
  angle = 0;

  onLaunch?: (params: LaunchParams) => void;

  private readonly arrow: THREE.Group;
  private readonly arrowMat: THREE.MeshStandardMaterial;
  private baseAngle = 0;
  private holdTime = 0;

  constructor(scene: THREE.Scene) {
    this.arrow = new THREE.Group();
    this.arrowMat = new THREE.MeshStandardMaterial({
      color: 0x0c1428,
      emissive: 0x36e0c8,
      emissiveIntensity: 1.4,
      metalness: 0.3,
      roughness: 0.4,
    });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.36), this.arrowMat);
    shaft.position.x = 1.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 16), this.arrowMat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 3.05;
    this.arrow.add(shaft, head);
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  /** Begin the launch phase: park the aim arrow at the player's launch spot. */
  begin(originX: number, originZ: number, defaultAngle: number): void {
    this.active = true;
    this.charging = false;
    this.power = 0;
    this.holdTime = 0;
    this.baseAngle = defaultAngle;
    this.angle = defaultAngle;
    const r = Math.hypot(originX, originZ);
    this.arrow.position.set(originX, bowlSurfaceY(r) + 0.45, originZ);
    this.arrow.visible = true;
  }

  end(): void {
    this.active = false;
    this.charging = false;
    this.arrow.visible = false;
  }

  // --- Input hooks (wired up by Game) ------------------------------------

  pointerDown(): void {
    if (!this.active) return;
    this.charging = true;
    this.holdTime = 0;
  }

  pointerMove(dragX: number): void {
    if (!this.active || !this.charging) return;
    this.angle = this.baseAngle + dragX * AIM_SENSITIVITY;
  }

  pointerUp(release: PointerRelease): void {
    if (!this.active || !this.charging) return;
    this.charging = false;
    this.angle = this.baseAngle + release.dragX * AIM_SENSITIVITY;
    // A fast flick (ripcord pull) tops up power on top of the hold charge.
    const flickBonus = clamp(release.flickSpeed / 2400, 0, 0.5);
    this.power = clamp(this.power + flickBonus, 0, 1);
    this.fire();
  }

  spaceChange(down: boolean): void {
    if (!this.active) return;
    if (down) {
      this.charging = true;
      this.holdTime = 0;
    } else if (this.charging) {
      this.charging = false;
      this.fire();
    }
  }

  private fire(): void {
    const params: LaunchParams = { power: clamp(this.power, 0.1, 1), angle: this.angle };
    this.onLaunch?.(params);
  }

  // --- Per-frame ---------------------------------------------------------

  update(dt: number): void {
    if (!this.active) return;
    if (this.charging) {
      this.holdTime += dt;
      this.power = clamp(this.holdTime / BALANCE.chargeTime, 0, 1);
    }
    this.arrow.rotation.y = -this.angle;
    const len = 0.55 + this.power * 1.05;
    this.arrow.scale.set(len, 1, 1);
    this.arrowMat.emissiveIntensity = 1.0 + this.power * 1.6;
  }

  dispose(): void {
    this.arrow.removeFromParent();
    this.arrowMat.dispose();
    this.arrow.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
