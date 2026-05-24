// Procedural stadium meshes. The bowl is a lathed parabola; each stadium kind
// swaps in its own material treatment and decoration; every stadium also gets
// a sky dome, an animated tech-medallion floor, light pillars around the rim,
// and a drifting cloud of ambient motes — to fill the world and sell the scale.

import * as THREE from 'three';
import type { StadiumConfig } from '../core/types';
import { BALANCE } from '../data/balance';
import { bowlSurfaceY } from '../core/arena';
import {
  makeGridTexture,
  makeIceTexture,
  makeLavaTexture,
  makeRockTexture,
  makeSkyTexture,
  makeStadiumNameTexture,
} from './textures';
import { AmbientMotes, type MotesOpts } from './AmbientMotes';

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

  // --- Sky dome (per-stadium tinted, fog-immune). ---------------------------
  const skyTex = makeSkyTexture(cfg.palette);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyGeo = new THREE.SphereGeometry(82, 40, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  group.add(sky);
  disposables.push(skyGeo, skyMat, skyTex);

  // --- Bowl. ----------------------------------------------------------------
  const bowlGeo = new THREE.LatheGeometry(bowlProfile(), 72);
  const { mat: bowlMat, map: bowlMap } = bowlMaterial(cfg);
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.receiveShadow = true;
  group.add(bowl);
  disposables.push(bowlGeo, bowlMat, bowlMap);

  // --- Animated tech-medallion on the bowl floor centre. --------------------
  const gridTex = makeGridTexture(cfg.palette.accent);
  const gridMat = new THREE.MeshBasicMaterial({
    map: gridTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const gridGeo = new THREE.CircleGeometry(BALANCE.bowlRadius * 0.62, 56);
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.03;
  group.add(grid);
  disposables.push(gridGeo, gridMat, gridTex);

  // --- Rim torus. -----------------------------------------------------------
  const rimMat = new THREE.MeshStandardMaterial({
    color: cfg.palette.rim,
    emissive: cfg.palette.accent,
    emissiveIntensity: cfg.kind === 'lava' ? 0.55 : 0.22,
    metalness: 0.7,
    roughness: 0.35,
  });
  const rimGeo = new THREE.TorusGeometry(BALANCE.bowlRadius + 0.55, 0.4, 12, 80);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BALANCE.bowlDepth + 0.4;
  group.add(rim);
  disposables.push(rimGeo, rimMat);

  // --- Outer ground. --------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({
    color: cfg.palette.fog,
    metalness: 0.18,
    roughness: 0.88,
  });
  const groundGeo = new THREE.RingGeometry(BALANCE.bowlRadius + 0.9, 70, 48);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = BALANCE.bowlDepth + 0.18;
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // --- Light pillars around the rim — emissive only, bloom does the glow. ---
  const pillarRingMat = new THREE.MeshStandardMaterial({
    color: cfg.palette.rim,
    metalness: 0.85,
    roughness: 0.32,
  });
  const pillarGlowMat = new THREE.MeshStandardMaterial({
    color: 0x0c1018,
    emissive: cfg.palette.accent,
    emissiveIntensity: cfg.kind === 'lava' ? 2.2 : 1.5,
    metalness: 0.55,
    roughness: 0.45,
  });
  // Volumetric light beam shooting upward from each pillar — additive cone.
  const beamMat = new THREE.MeshBasicMaterial({
    color: cfg.palette.accent,
    transparent: true,
    opacity: cfg.kind === 'lava' ? 0.22 : 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const pillarBaseGeo = new THREE.CylinderGeometry(0.55, 0.75, 0.6, 10);
  const pillarTrunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 5.4, 10);
  const pillarCapGeo = new THREE.SphereGeometry(0.5, 14, 10);
  const beamGeo = new THREE.CylinderGeometry(1.4, 0.16, 22, 14, 1, true);
  const PILLAR_RADIUS = BALANCE.bowlRadius + 3.8;
  const PILLAR_COUNT = 8;
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const a = (i / PILLAR_COUNT) * Math.PI * 2 + Math.PI / PILLAR_COUNT;
    const x = Math.cos(a) * PILLAR_RADIUS;
    const z = Math.sin(a) * PILLAR_RADIUS;
    const baseY = BALANCE.bowlDepth + 0.5;
    const base = new THREE.Mesh(pillarBaseGeo, pillarRingMat);
    base.position.set(x, baseY, z);
    base.castShadow = true;
    group.add(base);
    const trunk = new THREE.Mesh(pillarTrunkGeo, pillarGlowMat);
    trunk.position.set(x, baseY + 2.9, z);
    trunk.castShadow = true;
    group.add(trunk);
    const cap = new THREE.Mesh(pillarCapGeo, pillarGlowMat);
    cap.position.set(x, baseY + 5.8, z);
    cap.castShadow = true;
    group.add(cap);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, baseY + 5.8 + 11, z);
    beam.renderOrder = 2;
    group.add(beam);
  }
  disposables.push(pillarBaseGeo, pillarTrunkGeo, pillarCapGeo, beamGeo, pillarRingMat, pillarGlowMat, beamMat);

  // --- Spikes (Spiked Pit only). --------------------------------------------
  let spikes: THREE.InstancedMesh | null = null;
  if (cfg.kind === 'spiked') {
    spikes = buildSpikes(cfg);
    group.add(spikes);
    disposables.push(spikes.geometry, spikes.material as THREE.Material);
  }

  // --- Holographic containment ring floating above the arena. ---------------
  const containmentMat = new THREE.MeshBasicMaterial({
    color: cfg.palette.accent,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const containmentGeo = new THREE.TorusGeometry(BALANCE.bowlRadius + 0.3, 0.09, 14, 96);
  const containment = new THREE.Mesh(containmentGeo, containmentMat);
  containment.rotation.x = Math.PI / 2;
  containment.position.y = BALANCE.bowlDepth + 7;
  group.add(containment);
  disposables.push(containmentGeo, containmentMat);

  // --- Sky banner showing the stadium name. ---------------------------------
  const nameTex = makeStadiumNameTexture(cfg.name, cfg.palette.accent);
  const nameMat = new THREE.SpriteMaterial({
    map: nameTex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const nameSprite = new THREE.Sprite(nameMat);
  nameSprite.scale.set(10, 2.5, 1);
  nameSprite.position.set(0, BALANCE.bowlDepth + 10, 0);
  group.add(nameSprite);
  disposables.push(nameMat, nameTex);

  // --- Per-stadium weather — snow / embers / dust / sparkles. ---------------
  const moteOpts: MotesOpts = (() => {
    switch (cfg.kind) {
      case 'ice':
        return { color: 0xd6ecff, count: 240, size: 0.32, opacity: 0.85, vYDir: -1, vYSpeed: 0.7, hSpeed: 0.25 };
      case 'lava':
        return { color: 0xff8a2a, count: 240, size: 0.4, opacity: 0.95, vYDir: 1, vYSpeed: 0.55, hSpeed: 0.3 };
      case 'spiked':
        return { color: 0xc69d5a, count: 200, size: 0.3, opacity: 0.55, vYDir: -1, vYSpeed: 0.25, hSpeed: 0.4 };
      default:
        return { color: cfg.palette.accent, count: 160, size: 0.34, opacity: 0.65, vYDir: 1, vYSpeed: 0.18, hSpeed: 0.35 };
    }
  })();
  const motes = new AmbientMotes(moteOpts);
  group.add(motes.points);
  disposables.push(motes);

  // --- Accent fill light low in the bowl. -----------------------------------
  const light = new THREE.PointLight(cfg.palette.accent, cfg.kind === 'lava' ? 26 : 10, 50, 2);
  light.position.set(0, 2.4, 0);
  group.add(light);

  const lavaMat = cfg.kind === 'lava' ? bowlMat : null;
  const spikeDummy = new THREE.Object3D();

  return {
    group,
    light,
    update(dt: number, time: number): void {
      // Tech-medallion rotates slowly — a constant low-energy idle.
      gridTex.rotation = time * 0.18;

      // Containment ring breathes vertically + pulses opacity.
      containment.position.y = BALANCE.bowlDepth + 7 + Math.sin(time * 0.6) * 0.4;
      containmentMat.opacity = 0.35 + Math.sin(time * 1.7) * 0.2;

      // Stadium banner bobs in place.
      nameSprite.position.y = BALANCE.bowlDepth + 10 + Math.sin(time * 0.45) * 0.25;

      if (lavaMat) {
        lavaMat.emissiveIntensity = 0.82 + Math.sin(time * 2.1) * 0.3;
        if (lavaMat.emissiveMap) {
          lavaMat.emissiveMap.offset.x = (time * 0.018) % 1;
          lavaMat.emissiveMap.offset.y = (time * 0.012) % 1;
        }
        light.intensity = 22 + Math.sin(time * 3.0) * 7;
      } else {
        // Subtle breathing pulse on the pillar emissives.
        pillarGlowMat.emissiveIntensity = 1.5 + Math.sin(time * 1.3) * 0.3;
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

      motes.update(dt);
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
    },
  };
}
