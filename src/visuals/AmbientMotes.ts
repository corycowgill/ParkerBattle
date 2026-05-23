// Drifting particle cloud — the per-stadium "weather" layer. Cheap,
// GPU-friendly, additive so the bloom turns each mote into a soft glint.
//
// One class powers four weather looks (configured by the caller):
//   smooth -> slow rising sparkles
//   spiked -> slow falling dust
//   lava   -> rising hot embers
//   ice    -> falling snow

import * as THREE from 'three';
import { makeMoteTexture } from './textures';

export interface MotesOpts {
  color: number;
  /** How many motes to spawn. */
  count?: number;
  /** Point size (world units, attenuated by distance). */
  size?: number;
  /** Material opacity. */
  opacity?: number;
  /** +1 = rising, -1 = falling. */
  vYDir?: number;
  /** Mean vertical speed (units/s). */
  vYSpeed?: number;
  /** Horizontal jitter speed (units/s). */
  hSpeed?: number;
}

const HALF_X = 18;
const HALF_Z = 18;
const Y_LOW = 0.6;
const Y_HIGH = 13;

export class AmbientMotes {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly mat: THREE.PointsMaterial;
  private readonly vYDir: number;

  constructor(opts: MotesOpts) {
    const count = opts.count ?? 140;
    this.vYDir = opts.vYDir ?? 1;
    const vYSpeed = opts.vYSpeed ?? 0.18;
    const hSpeed = opts.hSpeed ?? 0.35;

    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.pos[i3 + 0] = (Math.random() - 0.5) * HALF_X * 2;
      this.pos[i3 + 1] = Y_LOW + Math.random() * (Y_HIGH - Y_LOW);
      this.pos[i3 + 2] = (Math.random() - 0.5) * HALF_Z * 2;
      this.vel[i3 + 0] = (Math.random() - 0.5) * hSpeed;
      this.vel[i3 + 1] = this.vYDir * (vYSpeed * (0.5 + Math.random()));
      this.vel[i3 + 2] = (Math.random() - 0.5) * hSpeed;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));

    this.mat = new THREE.PointsMaterial({
      size: opts.size ?? 0.34,
      map: makeMoteTexture(),
      color: opts.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: opts.opacity ?? 0.72,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(dt: number): void {
    const count = this.pos.length / 3;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.pos[i3 + 0] += this.vel[i3 + 0] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      // Wrap when motes drift past the volume bounds.
      if (this.vYDir > 0) {
        if (this.pos[i3 + 1] > Y_HIGH) {
          this.pos[i3 + 1] = Y_LOW;
          this.pos[i3 + 0] = (Math.random() - 0.5) * HALF_X * 2;
          this.pos[i3 + 2] = (Math.random() - 0.5) * HALF_Z * 2;
        }
      } else {
        if (this.pos[i3 + 1] < Y_LOW) {
          this.pos[i3 + 1] = Y_HIGH;
          this.pos[i3 + 0] = (Math.random() - 0.5) * HALF_X * 2;
          this.pos[i3 + 2] = (Math.random() - 0.5) * HALF_Z * 2;
        }
      }
      if (this.pos[i3 + 0] > HALF_X) this.pos[i3 + 0] = -HALF_X;
      else if (this.pos[i3 + 0] < -HALF_X) this.pos[i3 + 0] = HALF_X;
      if (this.pos[i3 + 2] > HALF_Z) this.pos[i3 + 2] = -HALF_Z;
      else if (this.pos[i3 + 2] < -HALF_Z) this.pos[i3 + 2] = HALF_Z;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
