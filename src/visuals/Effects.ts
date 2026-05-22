// Expanding shockwave rings — flat additive rings that bloom hard and sell the
// impact of every clash, ring-out, and burst. A small pooled set, recycled.

import * as THREE from 'three';

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  maxScale: number;
}

const POOL = 16;

export class Effects {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly geo: THREE.RingGeometry;
  private cursor = 0;

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
    this.group.removeFromParent();
  }
}
