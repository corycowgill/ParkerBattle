// CPU particle pool. One THREE.Points object, additively blended, recycled in
// a ring buffer — no per-frame allocation. Used for clash sparks, burst debris
// glints, and the dust trail under fast-moving beys.

import * as THREE from 'three';
import { makeSparkTexture } from './textures';

export interface EmitOptions {
  count: number;
  color: THREE.ColorRepresentation;
  speed: number;
  spread: number;
  life: number;
  /** Extra upward bias added to velocity. */
  rise?: number;
  drag?: number;
}

const POOL = 360;

export class Particles {
  readonly points: THREE.Points;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly velocity: Float32Array;
  private readonly baseColor: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.position = new Float32Array(POOL * 3);
    this.color = new Float32Array(POOL * 3);
    this.velocity = new Float32Array(POOL * 3);
    this.baseColor = new Float32Array(POOL * 3);
    this.life = new Float32Array(POOL);
    this.maxLife = new Float32Array(POOL);
    this.drag = new Float32Array(POOL);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      map: makeSparkTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, opts: EmitOptions): void {
    this.tmpColor.set(opts.color);
    for (let n = 0; n < opts.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % POOL;
      const i3 = i * 3;

      this.position[i3] = x;
      this.position[i3 + 1] = y;
      this.position[i3 + 2] = z;

      const dir = Math.random() * Math.PI * 2;
      const elev = Math.random() * opts.spread;
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      this.velocity[i3] = Math.cos(dir) * Math.cos(elev) * sp;
      this.velocity[i3 + 1] = Math.sin(elev) * sp + (opts.rise ?? 0);
      this.velocity[i3 + 2] = Math.sin(dir) * Math.cos(elev) * sp;

      this.baseColor[i3] = this.tmpColor.r;
      this.baseColor[i3 + 1] = this.tmpColor.g;
      this.baseColor[i3 + 2] = this.tmpColor.b;
      this.color[i3] = this.tmpColor.r;
      this.color[i3 + 1] = this.tmpColor.g;
      this.color[i3 + 2] = this.tmpColor.b;

      this.life[i] = opts.life;
      this.maxLife[i] = opts.life;
      this.drag[i] = opts.drag ?? 2.2;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.color[i3] = this.color[i3 + 1] = this.color[i3 + 2] = 0;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.velocity[i3] *= d;
      this.velocity[i3 + 1] = this.velocity[i3 + 1] * d - 7 * dt;
      this.velocity[i3 + 2] *= d;
      this.position[i3] += this.velocity[i3] * dt;
      this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
      this.position[i3 + 2] += this.velocity[i3 + 2] * dt;

      const k = this.life[i] / this.maxLife[i];
      this.color[i3] = this.baseColor[i3] * k;
      this.color[i3 + 1] = this.baseColor[i3 + 1] * k;
      this.color[i3 + 2] = this.baseColor[i3 + 2] * k;
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
