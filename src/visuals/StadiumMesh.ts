// Procedural stadium meshes. The bowl is a lathed parabola; each stadium kind
// swaps in its own material treatment and decoration:
//   smooth  - neutral rough rock
//   spiked  - rock + an InstancedMesh field of bobbing spikes
//   lava    - dark rock with an animated glowing emissive crack map
//   ice     - glossy low-roughness surface picking up the environment map

import * as THREE from 'three';
import type { StadiumConfig } from '../core/types';
import { BALANCE } from '../data/balance';
import { bowlSurfaceY } from '../core/arena';
import { makeIceTexture, makeLavaTexture, makeRockTexture } from './textures';

export interface StadiumVisual {
  group: THREE.Group;
  light: THREE.PointLight;
  update(dt: number, time: number): void;
  dispose(): void;
}

function bowlProfile(): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * BALANCE.bowlRadius;
    pts.push(new THREE.Vector2(r, bowlSurfaceY(r)));
  }
  // Rim lip flaring outward.
  pts.push(new THREE.Vector2(BALANCE.bowlRadius + 0.55, BALANCE.bowlDepth + 0.4));
  pts.push(new THREE.Vector2(BALANCE.bowlRadius + 1.0, BALANCE.bowlDepth + 0.16));
  return pts;
}

function bowlMaterial(cfg: StadiumConfig): { mat: THREE.MeshStandardMaterial; map: THREE.Texture } {
  const hex = '#' + cfg.palette.floor.toString(16).padStart(6, '0');
  switch (cfg.kind) {
    case 'ice': {
      const map = makeIceTexture();
      return {
        mat: new THREE.MeshStandardMaterial({
          map,
          color: cfg.palette.floor,
          metalness: 0.35,
          roughness: 0.09,
          envMapIntensity: 1.4,
          side: THREE.DoubleSide,
        }),
        map,
      };
    }
    case 'lava': {
      const map = makeLavaTexture();
      return {
        mat: new THREE.MeshStandardMaterial({
          color: cfg.palette.floor,
          emissive: cfg.palette.accent,
          emissiveMap: map,
          emissiveIntensity: 0.9,
          metalness: 0.2,
          roughness: 0.62,
          side: THREE.DoubleSide,
        }),
        map,
      };
    }
    default: {
      const map = makeRockTexture(hex);
      return {
        mat: new THREE.MeshStandardMaterial({
          map,
          color: cfg.palette.floor,
          metalness: 0.12,
          roughness: 0.78,
          side: THREE.DoubleSide,
        }),
        map,
      };
    }
  }
}

function buildSpikes(cfg: StadiumConfig): THREE.InstancedMesh {
  const count = 78;
  const geo = new THREE.ConeGeometry(0.22, 0.6, 7);
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.palette.accent,
    metalness: 0.35,
    roughness: 0.55,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.userData.bases = [] as { x: number; z: number; y: number; phase: number }[];
  const bases = mesh.userData.bases as { x: number; z: number; y: number; phase: number }[];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * BALANCE.bowlRadius * 0.9;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const y = bowlSurfaceY(rad) + 0.18;
    bases.push({ x, z, y, phase: Math.random() * Math.PI * 2 });
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildStadium(cfg: StadiumConfig): StadiumVisual {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  // Bowl.
  const bowlGeo = new THREE.LatheGeometry(bowlProfile(), 72);
  const { mat: bowlMat, map: bowlMap } = bowlMaterial(cfg);
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  group.add(bowl);
  disposables.push(bowlGeo, bowlMat, bowlMap);

  // Rim ring.
  const rimMat = new THREE.MeshStandardMaterial({
    color: cfg.palette.rim,
    emissive: cfg.palette.accent,
    emissiveIntensity: cfg.kind === 'lava' ? 0.5 : 0.18,
    metalness: 0.7,
    roughness: 0.35,
  });
  const rimGeo = new THREE.TorusGeometry(BALANCE.bowlRadius + 0.55, 0.4, 12, 80);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BALANCE.bowlDepth + 0.4;
  group.add(rim);
  disposables.push(rimGeo, rimMat);

  // Outer ground so the bowl sits in a floor.
  const groundMat = new THREE.MeshStandardMaterial({
    color: cfg.palette.fog,
    metalness: 0.1,
    roughness: 0.95,
  });
  const groundGeo = new THREE.RingGeometry(BALANCE.bowlRadius + 0.9, 70, 48);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = BALANCE.bowlDepth + 0.18;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // Spikes (spiked stadium only).
  let spikes: THREE.InstancedMesh | null = null;
  if (cfg.kind === 'spiked') {
    spikes = buildSpikes(cfg);
    group.add(spikes);
    disposables.push(spikes.geometry, spikes.material as THREE.Material);
  }

  // Accent fill light low in the bowl.
  const light = new THREE.PointLight(cfg.palette.accent, cfg.kind === 'lava' ? 26 : 10, 46, 2);
  light.position.set(0, 2.4, 0);
  group.add(light);

  const lavaMat = cfg.kind === 'lava' ? bowlMat : null;
  const spikeDummy = new THREE.Object3D();

  return {
    group,
    light,
    update(_dt: number, time: number): void {
      if (lavaMat) {
        lavaMat.emissiveIntensity = 0.78 + Math.sin(time * 2.1) * 0.28;
        if (lavaMat.emissiveMap) {
          lavaMat.emissiveMap.offset.x = (time * 0.018) % 1;
          lavaMat.emissiveMap.offset.y = (time * 0.012) % 1;
        }
        light.intensity = 22 + Math.sin(time * 3.0) * 7;
      }
      if (spikes) {
        const bases = spikes.userData.bases as { x: number; z: number; y: number; phase: number }[];
        for (let i = 0; i < bases.length; i++) {
          const b = bases[i];
          const bob = Math.sin(time * 3.4 + b.phase) * 0.12;
          spikeDummy.position.set(b.x, b.y + bob, b.z);
          spikeDummy.rotation.set(0, b.phase, 0);
          spikeDummy.updateMatrix();
          spikes.setMatrixAt(i, spikeDummy.matrix);
        }
        spikes.instanceMatrix.needsUpdate = true;
      }
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
    },
  };
}
