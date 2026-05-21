// Procedural textures, all drawn with Canvas2D at load time.
//
// The design doc suggests shader materials; we deliberately use procedural
// CanvasTextures + standard PBR materials instead. They are reliable across
// every mobile GPU, need no asset files (the game runs fully offline), and
// — animated by scrolling offsets / emissive pulsing — read just as well.

import * as THREE from 'three';

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { c, ctx };
}

/** Equirectangular gradient used as the scene environment for PBR reflections. */
export function makeEnvironmentTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#aab6e8');
  g.addColorStop(0.45, '#5560a0');
  g.addColorStop(0.55, '#2a2f50');
  g.addColorStop(1, '#0a0c18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // A soft "key light" hotspot for a believable specular highlight.
  const hot = ctx.createRadialGradient(150, 70, 4, 150, 70, 120);
  hot.addColorStop(0, 'rgba(255,255,255,0.9)');
  hot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial dot for additive particle sprites. */
export function makeSparkTexture(): THREE.Texture {
  const { c, ctx } = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Glowing crack network for the lava stadium emissive map. */
export function makeLavaTexture(): THREE.Texture {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#1a0500';
  ctx.fillRect(0, 0, 256, 256);
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 5 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    const w = 1 + Math.random() * 3;
    ctx.strokeStyle = '#ff6a1a';
    ctx.lineWidth = w + 3;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = w;
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Frosty mottled noise for the ice stadium. */
export function makeIceTexture(): THREE.Texture {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#bfe6ff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const r = Math.random() * 18;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.16})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hairline cracks.
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = 'rgba(120,170,210,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rough grainy rock for the spiked / smooth floors. */
export function makeRockTexture(base: string): THREE.Texture {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    ctx.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Energy-layer decal — concentric rings tinted to the part colour. */
export function makeDecalTexture(color: number): THREE.Texture {
  const { c, ctx } = canvas(128);
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.clearRect(0, 0, 128, 128);
  for (let r = 56; r > 8; r -= 12) {
    ctx.beginPath();
    ctx.arc(64, 64, r, 0, Math.PI * 2);
    ctx.strokeStyle = hex;
    ctx.globalAlpha = 0.5 + (56 - r) / 110;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(64, 64, 7, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
