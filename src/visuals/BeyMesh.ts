// Procedural bey geometry. A bey is three stacked parts (Energy Layer / Forge
// Disc / Driver) built from cheap primitives — cylinders, boxes, a cone. No
// imported meshes; everything is generated so it stays tiny and mobile-cheap.
//
// Structure:  root (position + tilt)  ->  spinner (Y spin)  ->  the three parts
// Keeping spin on an inner node means tilt/wobble compose cleanly with spin,
// and a Burst can simply detach the three part groups and fling them.

import * as THREE from 'three';
import type { Driver, DriverType, EnergyLayer, ForgeDisc } from '../core/types';
import { makeDecalTexture } from './textures';

export const TYPE_COLOR: Record<DriverType, number> = {
  attack: 0xff5a36,
  defense: 0x3f9bff,
  stamina: 0x49e6a4,
  balance: 0xe0c24a,
};

export interface BeyVisual {
  root: THREE.Group;
  spinner: THREE.Group;
  layer: THREE.Group;
  disc: THREE.Group;
  driver: THREE.Group;
  accent: THREE.MeshStandardMaterial;
  dispose(): void;
}

function buildLayer(layer: EnergyLayer): { group: THREE.Group; disposables: THREE.Material[] } {
  const group = new THREE.Group();
  const disposables: THREE.Material[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: layer.color,
    metalness: 0.62,
    roughness: 0.32,
  });
  disposables.push(bodyMat);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.9, 0.34, 30), bodyMat);
  ring.position.y = 0.23;
  group.add(ring);

  // Radial attack blades — count + sweep come from the part data.
  const bladeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.color).multiplyScalar(1.25),
    metalness: 0.7,
    roughness: 0.28,
  });
  disposables.push(bladeMat);
  const bladeGeo = new THREE.BoxGeometry(0.46, 0.26, 0.16);
  for (let i = 0; i < layer.blades; i++) {
    const a = (i / layer.blades) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.cos(a) * 0.96, 0.23, Math.sin(a) * 0.96);
    blade.rotation.y = -a + 0.5;
    group.add(blade);
  }

  // Glowing decal cap on top.
  const decalTex = makeDecalTexture(layer.color);
  const decalMat = new THREE.MeshBasicMaterial({
    map: decalTex,
    transparent: true,
    depthWrite: false,
  });
  disposables.push(decalMat);
  const decal = new THREE.Mesh(new THREE.CircleGeometry(0.78, 24), decalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.405;
  group.add(decal);

  return { group, disposables };
}

function buildDisc(disc: ForgeDisc): { group: THREE.Group; disposables: THREE.Material[] } {
  const group = new THREE.Group();
  const radius = disc.shape === 'wide' ? 0.94 : disc.shape === 'star' ? 0.7 : 0.8;
  const segments = disc.shape === 'star' ? 12 : 26;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a3f55,
    metalness: 0.92,
    roughness: 0.26,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.24, segments), mat);
  mesh.position.y = -0.04;
  group.add(mesh);
  return { group, disposables: [mat] };
}

function buildDriver(driver: Driver): { group: THREE.Group; disposables: THREE.Material[] } {
  const group = new THREE.Group();
  const color = TYPE_COLOR[driver.type];
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });

  let tip: THREE.Mesh;
  switch (driver.type) {
    case 'attack':
      // Flat/rubber — wide low tip, slips and roams.
      tip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.2, 18), mat);
      tip.position.y = -0.26;
      break;
    case 'defense':
      // Ball — rounded, soaks knockback.
      tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), mat);
      tip.position.y = -0.3;
      break;
    case 'stamina':
      // Needle — thin sharp point, hugs centre.
      tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.46, 14), mat);
      tip.position.y = -0.39;
      tip.rotation.x = Math.PI;
      break;
    default:
      // Balance — medium cone.
      tip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 16), mat);
      tip.position.y = -0.34;
      tip.rotation.x = Math.PI;
      break;
  }
  group.add(tip);

  // Short collar joining the tip to the disc.
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3e, metalness: 0.8, roughness: 0.4 });
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 16), collarMat);
  collar.position.y = -0.16;
  group.add(collar);

  return { group, disposables: [mat, collarMat] };
}

export function buildBey(layer: EnergyLayer, disc: ForgeDisc, driver: Driver): BeyVisual {
  const root = new THREE.Group();
  const spinner = new THREE.Group();
  root.add(spinner);

  const built = [buildLayer(layer), buildDisc(disc), buildDriver(driver)];
  const [layerB, discB, driverB] = built;
  spinner.add(layerB.group, discB.group, driverB.group);

  // Emissive accent ring — Bey drives its intensity with spin / special state.
  const accent = new THREE.MeshStandardMaterial({
    color: 0x101018,
    emissive: TYPE_COLOR[driver.type],
    emissiveIntensity: 1,
    metalness: 0.3,
    roughness: 0.4,
  });
  const accentRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.07, 8, 30), accent);
  accentRing.rotation.x = Math.PI / 2;
  accentRing.position.y = 0.06;
  spinner.add(accentRing);

  const geoms: THREE.BufferGeometry[] = [];
  spinner.traverse((o) => {
    if (o instanceof THREE.Mesh) geoms.push(o.geometry);
  });
  const mats = built.flatMap((b) => b.disposables);
  mats.push(accent);

  return {
    root,
    spinner,
    layer: layerB.group,
    disc: discB.group,
    driver: driverB.group,
    accent,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) {
        const mm = m as THREE.MeshStandardMaterial & { map?: THREE.Texture | null };
        if (mm.map) mm.map.dispose();
        m.dispose();
      }
    },
  };
}
