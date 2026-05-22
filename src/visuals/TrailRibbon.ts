// Per-bey ribbon trail. A flat additive triangle strip that hugs the bowl
// surface and follows the bey's recent path, tapering in width and brightness
// from the head to the tail. With bloom, it reads as a glowing energy trail.

import * as THREE from 'three';
import { bowlSurfaceY } from '../core/arena';

const SEGS = 36;
const VERTS = (SEGS + 1) * 2;

export class TrailRibbon {
  readonly mesh: THREE.Mesh;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly buffer: { x: number; z: number }[] = [];
  private readonly base: THREE.Color;
  private readonly halfWidth: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(color: number, halfWidth = 0.35) {
    this.base = new THREE.Color(color);
    this.halfWidth = halfWidth;
    this.position = new Float32Array(VERTS * 3);
    this.color = new Float32Array(VERTS * 3);

    const indices: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.geometry.setIndex(indices);

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Reset the ribbon to a single point — call on launch / respawn. */
  reset(x: number, z: number): void {
    this.buffer.length = 0;
    for (let i = 0; i <= SEGS; i++) this.buffer.push({ x, z });
    this.rebuild();
    this.mesh.visible = true;
  }

  /** Append a new head sample and shift the rest back. */
  push(x: number, z: number): void {
    this.buffer.unshift({ x, z });
    if (this.buffer.length > SEGS + 1) this.buffer.pop();
    while (this.buffer.length < SEGS + 1) this.buffer.push({ x, z });
    this.rebuild();
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  private rebuild(): void {
    const p = this.position;
    const c = this.color;
    for (let i = 0; i <= SEGS; i++) {
      const pt = this.buffer[i];
      const prev = this.buffer[Math.max(0, i - 1)];
      const next = this.buffer[Math.min(SEGS, i + 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const t = i / SEGS;
      // Slight bulge at the head, sharp taper to the tail.
      const w = this.halfWidth * (1 - t) * (0.6 + 0.4 * (1 - t));
      const y = bowlSurfaceY(Math.hypot(pt.x, pt.z)) + 0.09;
      const lx = pt.x + px * w;
      const lz = pt.z + pz * w;
      const rx = pt.x - px * w;
      const rz = pt.z - pz * w;
      const vi = i * 2;
      p[vi * 3 + 0] = lx;
      p[vi * 3 + 1] = y;
      p[vi * 3 + 2] = lz;
      p[(vi + 1) * 3 + 0] = rx;
      p[(vi + 1) * 3 + 1] = y;
      p[(vi + 1) * 3 + 2] = rz;
      // Brighter near the head, fading along the tail.
      const a = (1 - t) * (1 - t) * 1.1;
      c[vi * 3 + 0] = this.base.r * a;
      c[vi * 3 + 1] = this.base.g * a;
      c[vi * 3 + 2] = this.base.b * a;
      c[(vi + 1) * 3 + 0] = this.base.r * a;
      c[(vi + 1) * 3 + 1] = this.base.g * a;
      c[(vi + 1) * 3 + 2] = this.base.b * a;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
