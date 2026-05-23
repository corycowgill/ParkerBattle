// Ambient floating motes — a slow drifting particle cloud for atmosphere.
// Cheap, GPU-friendly, additive so the bloom turns them into soft glints.

import * as THREE from 'three';
import { makeMoteTexture } from './textures';

const COUNT = 140;
const HALF_X = 18;
const HALF_Z = 18;
const Y_LOW = 0.6;
const Y_HIGH = 12;

export class AmbientMotes {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly mat: THREE.PointsMaterial;

  constructor(color: number) {
    this.pos = new Float32Array(COUNT * 3);
    this.vel = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      this.pos[i3 + 0] = (Math.random() - 0.5) * HALF_X * 2;
      this.pos[i3 + 1] = Y_LOW + Math.random() * (Y_HIGH - Y_LOW);
      this.pos[i3 + 2] = (Math.random() - 0.5) * HALF_Z * 2;
      this.vel[i3 + 0] = (Math.random() - 0.5) * 0.35;
      this.vel[i3 + 1] = Math.random() * 0.25 + 0.08;
      this.vel[i3 + 2] = (Math.random() - 0.5) * 0.35;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));

    this.mat = new THREE.PointsMaterial({
      size: 0.34,
      map: makeMoteTexture(),
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      opacity: 0.72,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(dt: number): void {
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      this.pos[i3 + 0] += this.vel[i3 + 0] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      // Wrap when motes drift past the volume bounds.
      if (this.pos[i3 + 1] > Y_HIGH) this.pos[i3 + 1] = Y_LOW;
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
