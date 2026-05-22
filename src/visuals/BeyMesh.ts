// Procedural bey geometry. A bey is three stacked parts (Energy Layer / Forge
// Disc / Driver). Every part *style* builds its own distinct silhouette from
// primitives — no two layers, discs or drivers share a shape.
//
// Structure:  root (position + tilt) -> spinner (Y spin) -> the three parts,
//             plus a flat energy aura on `root`.
// The three part builders are also exported individually so the Garage can
// show a live model of each part on its own.

import * as THREE from 'three';
import type { Driver, DriverType, EnergyLayer, ForgeDisc, Part } from '../core/types';
import { makeAuraTexture, makeDecalTexture } from './textures';

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
  aura: THREE.Mesh;
  auraMat: THREE.MeshBasicMaterial;
  dispose(): void;
}

export interface PartVisual {
  object: THREE.Group;
  dispose(): void;
}

interface PartBuild {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

// --- Small builder helpers --------------------------------------------------

function brighten(color: number, f: number): THREE.Color {
  return new THREE.Color(color).multiplyScalar(f);
}

/** Place an object built along +X out at the rim, facing outward. */
function radial(obj: THREE.Object3D, radius: number, angle: number, y: number, sweep = 0): void {
  obj.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  obj.rotation.y = -angle + sweep;
}

function disposePart(b: PartBuild): void {
  for (const g of b.geometries) g.dispose();
  for (const m of b.materials) {
    const mm = m as THREE.Material & { map?: THREE.Texture | null };
    if (mm.map) mm.map.dispose();
    m.dispose();
  }
}

// --- Energy Layers ----------------------------------------------------------

function buildLayer(layer: EnergyLayer): PartBuild {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: layer.color,
    metalness: 0.62,
    roughness: 0.3,
    emissive: layer.color,
    emissiveIntensity: 0.16,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: brighten(layer.color, 1.45),
    metalness: 0.8,
    roughness: 0.2,
    emissive: layer.color,
    emissiveIntensity: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x20242f, metalness: 0.85, roughness: 0.34 });
  const materials: THREE.Material[] = [baseMat, trimMat, darkMat];
  const geometries: THREE.BufferGeometry[] = [];

  const place = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  };
  // A geometry shared across N copies — registered for disposal just once.
  const shared = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    geometries.push(geo);
    return geo;
  };

  const TAU = Math.PI * 2;

  switch (layer.style) {
    case 'core': {
      place(new THREE.CylinderGeometry(0.95, 0.88, 0.34, 30), baseMat).position.y = 0.23;
      const bolt = shared(new THREE.BoxGeometry(0.5, 0.3, 0.3));
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(bolt, trimMat);
        radial(m, 0.86, (i / 3) * TAU, 0.23);
        group.add(m);
      }
      place(new THREE.CylinderGeometry(0.42, 0.46, 0.18, 6), trimMat).position.y = 0.44;
      break;
    }
    case 'blaze': {
      place(new THREE.CylinderGeometry(0.66, 0.6, 0.3, 24), baseMat).position.y = 0.22;
      const finBlade = shared(new THREE.BoxGeometry(0.62, 0.12, 0.34));
      const finTip = shared(new THREE.ConeGeometry(0.2, 0.5, 4));
      for (let i = 0; i < layer.blades; i++) {
        const fin = new THREE.Group();
        const blade = new THREE.Mesh(finBlade, trimMat);
        blade.position.x = 0.31;
        blade.rotation.z = 0.34; // sharp upward rake
        const tip = new THREE.Mesh(finTip, trimMat);
        tip.position.set(0.78, 0.16, 0);
        tip.rotation.z = -Math.PI / 2;
        fin.add(blade, tip);
        radial(fin, 0.58, (i / layer.blades) * TAU, 0.24, 0.5); // swept back
        group.add(fin);
      }
      break;
    }
    case 'aegis': {
      place(new THREE.CylinderGeometry(0.97, 0.93, 0.42, 32), baseMat).position.y = 0.24;
      const stud = shared(new THREE.SphereGeometry(0.16, 12, 10));
      for (let i = 0; i < layer.blades; i++) {
        const m = new THREE.Mesh(stud, trimMat);
        const a = (i / layer.blades) * TAU;
        m.position.set(Math.cos(a) * 0.97, 0.24, Math.sin(a) * 0.97);
        group.add(m);
      }
      const dome = place(new THREE.SphereGeometry(0.6, 20, 12), trimMat);
      dome.position.y = 0.4;
      dome.scale.y = 0.5;
      break;
    }
    case 'glide': {
      place(new THREE.CylinderGeometry(0.58, 0.55, 0.16, 22), baseMat).position.y = 0.2;
      const wing = shared(new THREE.BoxGeometry(0.95, 0.07, 0.22));
      for (let i = 0; i < layer.blades; i++) {
        const w = new THREE.Group();
        const blade = new THREE.Mesh(wing, trimMat);
        blade.position.x = 0.47;
        blade.rotation.z = 0.12;
        w.add(blade);
        radial(w, 0.52, (i / layer.blades) * TAU, 0.2, 0.62); // long swept wings
        group.add(w);
      }
      place(new THREE.ConeGeometry(0.26, 0.3, 16), trimMat).position.y = 0.4;
      break;
    }
    case 'storm': {
      place(new THREE.CylinderGeometry(0.7, 0.64, 0.32, 5), baseMat).position.y = 0.22;
      const spike = shared(new THREE.ConeGeometry(0.17, 0.85, 4));
      for (let i = 0; i < layer.blades; i++) {
        const s = new THREE.Group();
        const m = new THREE.Mesh(spike, trimMat);
        m.rotation.z = -Math.PI / 2;
        m.position.x = 0.42;
        m.rotation.y = i % 2 ? 0.5 : -0.5; // jagged alternation
        s.add(m);
        radial(s, 0.62, (i / layer.blades) * TAU, i % 2 ? 0.32 : 0.16, 0.2);
        group.add(s);
      }
      break;
    }
    case 'bastion': {
      place(new THREE.CylinderGeometry(0.95, 0.92, 0.46, 8), baseMat).position.y = 0.25;
      const block = shared(new THREE.BoxGeometry(0.34, 0.32, 0.34));
      for (let i = 0; i < layer.blades; i++) {
        const m = new THREE.Mesh(block, trimMat);
        const a = (i / layer.blades) * TAU + Math.PI / 8;
        m.position.set(Math.cos(a) * 0.78, 0.5, Math.sin(a) * 0.78);
        m.rotation.y = -a;
        group.add(m);
      }
      place(new THREE.CylinderGeometry(0.55, 0.6, 0.2, 8), darkMat).position.y = 0.45;
      break;
    }
  }

  // Glowing identity decal on top.
  const decalTex = makeDecalTexture(layer.color);
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false });
  materials.push(decalMat);
  const decal = place(new THREE.CircleGeometry(0.6, 24), decalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.62;

  return { group, materials, geometries };
}

// --- Forge Discs ------------------------------------------------------------

function buildDisc(disc: ForgeDisc): PartBuild {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f55, metalness: 0.92, roughness: 0.26 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x767f9e, metalness: 0.95, roughness: 0.2 });
  const materials: THREE.Material[] = [bodyMat, trimMat];
  const geometries: THREE.BufferGeometry[] = [];
  const TAU = Math.PI * 2;

  const place = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  };
  const shared = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    geometries.push(geo);
    return geo;
  };

  switch (disc.style) {
    case 'standard': {
      place(new THREE.CylinderGeometry(0.8, 0.8, 0.24, 28), bodyMat).position.y = -0.04;
      const hole = shared(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const m = new THREE.Mesh(hole, trimMat);
        m.position.set(Math.cos(a) * 0.55, -0.04, Math.sin(a) * 0.55);
        group.add(m);
      }
      break;
    }
    case 'light': {
      place(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 16), bodyMat).position.y = -0.04;
      const spoke = shared(new THREE.BoxGeometry(0.62, 0.1, 0.16));
      const node = shared(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const s = new THREE.Mesh(spoke, trimMat);
        radial(s, 0.6, a, -0.04);
        group.add(s);
        const n = new THREE.Mesh(node, bodyMat);
        n.position.set(Math.cos(a) * 0.88, -0.04, Math.sin(a) * 0.88);
        group.add(n);
      }
      break;
    }
    case 'heavy': {
      place(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 26), bodyMat).position.y = -0.04;
      const lobe = shared(new THREE.SphereGeometry(0.32, 14, 12));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const m = new THREE.Mesh(lobe, trimMat);
        m.position.set(Math.cos(a) * 0.74, -0.04, Math.sin(a) * 0.74);
        m.scale.set(1, 0.7, 1);
        group.add(m);
      }
      break;
    }
    case 'wide': {
      place(new THREE.CylinderGeometry(0.92, 0.92, 0.16, 36), bodyMat).position.y = -0.04;
      const flange = place(new THREE.TorusGeometry(0.9, 0.1, 10, 40), trimMat);
      flange.rotation.x = Math.PI / 2;
      flange.position.y = -0.04;
      place(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 18), trimMat).position.y = -0.02;
      break;
    }
  }

  return { group, materials, geometries };
}

// --- Drivers ----------------------------------------------------------------

function buildDriver(driver: Driver): PartBuild {
  const group = new THREE.Group();
  const color = TYPE_COLOR[driver.type];
  const tipMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.42,
    roughness: 0.48,
    emissive: color,
    emissiveIntensity: 0.2,
  });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3e, metalness: 0.82, roughness: 0.38 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x101016, metalness: 0.05, roughness: 0.95 });
  const materials: THREE.Material[] = [tipMat, collarMat, rubberMat];
  const geometries: THREE.BufferGeometry[] = [];

  const place = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  };

  // Shared collar joining the tip to the disc above.
  place(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 16), collarMat).position.y = -0.16;

  switch (driver.style) {
    case 'balance': {
      place(new THREE.ConeGeometry(0.26, 0.4, 16), tipMat).position.y = -0.36;
      break;
    }
    case 'flat': {
      place(new THREE.CylinderGeometry(0.44, 0.34, 0.18, 18), tipMat).position.y = -0.27;
      place(new THREE.CylinderGeometry(0.2, 0.12, 0.14, 14), tipMat).position.y = -0.4;
      break;
    }
    case 'rubber': {
      place(new THREE.CylinderGeometry(0.46, 0.4, 0.14, 20), tipMat).position.y = -0.26;
      const pad = place(new THREE.CylinderGeometry(0.4, 0.36, 0.16, 20), rubberMat);
      pad.position.y = -0.38;
      break;
    }
    case 'ball': {
      const ball = place(new THREE.SphereGeometry(0.3, 18, 14), tipMat);
      ball.position.y = -0.32;
      break;
    }
    case 'guard': {
      place(new THREE.CylinderGeometry(0.56, 0.5, 0.1, 24), tipMat).position.y = -0.26;
      const ring = place(new THREE.TorusGeometry(0.5, 0.07, 8, 28), tipMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.31;
      place(new THREE.SphereGeometry(0.16, 12, 10), collarMat).position.y = -0.4;
      break;
    }
    case 'needle': {
      place(new THREE.CylinderGeometry(0.14, 0.1, 0.2, 12), collarMat).position.y = -0.32;
      const needle = place(new THREE.ConeGeometry(0.07, 0.5, 12), tipMat);
      needle.position.y = -0.62;
      needle.rotation.x = Math.PI;
      break;
    }
    case 'orb': {
      place(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 10), collarMat).position.y = -0.34;
      place(new THREE.SphereGeometry(0.2, 16, 14), tipMat).position.y = -0.52;
      break;
    }
  }

  return { group, materials, geometries };
}

// --- Single-part visual (Garage preview) ------------------------------------

export function buildPartVisual(part: Part): PartVisual {
  const build =
    part.kind === 'layer'
      ? buildLayer(part)
      : part.kind === 'disc'
        ? buildDisc(part)
        : buildDriver(part);
  return { object: build.group, dispose: () => disposePart(build) };
}

// --- Full assembled bey -----------------------------------------------------

export function buildBey(layer: EnergyLayer, disc: ForgeDisc, driver: Driver): BeyVisual {
  const root = new THREE.Group();
  const spinner = new THREE.Group();
  root.add(spinner);

  const layerB = buildLayer(layer);
  const discB = buildDisc(disc);
  const driverB = buildDriver(driver);
  spinner.add(layerB.group, discB.group, driverB.group);

  // Emissive accent ring — Bey drives its intensity with spin / special state.
  const accent = new THREE.MeshStandardMaterial({
    color: 0x0c0c14,
    emissive: TYPE_COLOR[driver.type],
    emissiveIntensity: 1,
    metalness: 0.3,
    roughness: 0.4,
  });
  const accentGeo = new THREE.TorusGeometry(0.86, 0.08, 10, 32);
  const accentRing = new THREE.Mesh(accentGeo, accent);
  accentRing.rotation.x = Math.PI / 2;
  accentRing.position.y = 0.05;
  spinner.add(accentRing);

  // Flat spinning-energy aura on the floor under the bey.
  const auraTex = makeAuraTexture();
  const auraMat = new THREE.MeshBasicMaterial({
    map: auraTex,
    color: TYPE_COLOR[driver.type],
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5,
  });
  const auraGeo = new THREE.CircleGeometry(1, 36);
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = -0.44;
  aura.scale.setScalar(2.4);
  root.add(aura);

  const materials = [...layerB.materials, ...discB.materials, ...driverB.materials, accent, auraMat];
  const geometries = [
    ...layerB.geometries,
    ...discB.geometries,
    ...driverB.geometries,
    accentGeo,
    auraGeo,
  ];

  return {
    root,
    spinner,
    layer: layerB.group,
    disc: discB.group,
    driver: driverB.group,
    accent,
    aura,
    auraMat,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) {
        const mm = m as THREE.Material & { map?: THREE.Texture | null };
        if (mm.map) mm.map.dispose();
        m.dispose();
      }
    },
  };
}
