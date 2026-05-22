// Expanding shockwave rings + a jagged lightning arc between close beys. Both
// rendered with additive materials so the bloom pass paints them as energy.

import * as THREE from 'three';

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  maxScale: number;
}

const POOL = 16;
const ARC_N = 14;

export class Effects {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly geo: THREE.RingGeometry;
  private cursor = 0;

  private readonly arcLine: THREE.Line;
  private readonly arcGeo: THREE.BufferGeometry;
  private readonly arcMat: THREE.LineBasicMaterial;
  private readonly arcPos: Float32Array;

  constructor() {
    this.geo = new THREE.RingGeometry(0.62, 1.0, 44);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, life: 0, maxLife: 1, maxScale: 1 });
    }

    // Lightning arc — a jagged additive line regenerated each frame.
    this.arcPos = new Float32Array((ARC_N + 1) * 3);
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcMat = new THREE.LineBasicMaterial({
      color: 0xb4e8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });
    this.arcLine = new THREE.Line(this.arcGeo, this.arcMat);
    this.arcLine.visible = false;
    this.arcLine.frustumCulled = false;
    this.group.add(this.arcLine);
  }

  /** Spawn one expanding ring. */
  shockwave(
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    maxScale: number,
    life = 0.46,
  ): void {
    const r = this.rings[this.cursor];
    this.cursor = (this.cursor + 1) % POOL;
    r.mesh.position.set(x, y, z);
    r.mesh.visible = true;
    r.mat.color.set(color);
    r.mat.opacity = 0.95;
    r.mesh.scale.setScalar(0.25);
    r.life = life;
    r.maxLife = life;
    r.maxScale = maxScale;
  }

  /** A multi-ring blast for bursts / knockouts. */
  blast(x: number, y: number, z: number, color: THREE.ColorRepresentation): void {
    this.shockwave(x, y, z, 0xffffff, 9, 0.5);
    this.shockwave(x, y, z, color, 6.5, 0.62);
    this.shockwave(x, y + 0.4, z, color, 4, 0.74);
  }

  /** Drive the lightning arc between two world points. */
  setArc(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    intensity: number,
  ): void {
    if (intensity <= 0.02) {
      this.arcLine.visible = false;
      return;
    }
    this.arcLine.visible = true;
    this.arcMat.opacity = 0.45 + intensity * 0.6;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    const amp = 0.95 * intensity;
    for (let i = 0; i <= ARC_N; i++) {
      const t = i / ARC_N;
      const cx = ax + (bx - ax) * t;
      const cy = ay + (by - ay) * t;
      const cz = az + (bz - az) * t;
      // Zero jitter at the endpoints, peak in the middle.
      const env = Math.sin(Math.PI * t);
      const j = env * (Math.random() - 0.5) * amp * 2;
      this.arcPos[i * 3 + 0] = cx + px * j;
      this.arcPos[i * 3 + 1] = cy + (Math.random() - 0.5) * env * amp;
      this.arcPos[i * 3 + 2] = cz + pz * j;
    }
    (this.arcGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.maxLife;
      r.mesh.scale.setScalar(0.25 + t * r.maxScale);
      r.mat.opacity = Math.max(0, (1 - t) * (1 - t) * 0.95);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const r of this.rings) r.mat.dispose();
    this.arcGeo.dispose();
    this.arcMat.dispose();
    this.group.removeFromParent();
  }
}
