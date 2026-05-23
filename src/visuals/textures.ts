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

/** Soft glowing halo for the spinning-energy aura under each bey. */
export function makeAuraTexture(): THREE.Texture {
  const { c, ctx } = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hex(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function mix(a: number, b: number, t: number): string {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

/** Equirectangular sky dome — gradient + horizon glow + stars (when dark). */
export function makeSkyTexture(palette: { fog: number; accent: number }): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Vertical gradient: deep zenith -> base -> warm horizon.
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, mix(palette.fog, 0x000000, 0.55));
  g.addColorStop(0.55, hex(palette.fog));
  g.addColorStop(0.85, mix(palette.fog, palette.accent, 0.45));
  g.addColorStop(1, mix(palette.fog, palette.accent, 0.7));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);

  // Horizon glow band.
  const glow = ctx.createLinearGradient(0, 320, 0, 512);
  glow.addColorStop(0, hex(palette.accent, 0));
  glow.addColorStop(1, hex(palette.accent, 0.55));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 320, 1024, 192);

  // Stars in the upper hemisphere — denser at the zenith.
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 320;
    const a = (1 - y / 320) * (0.4 + Math.random() * 0.6);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    const r = Math.random() < 0.06 ? 1.4 + Math.random() * 1.2 : Math.random() * 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A handful of brighter "feature" stars with a soft halo.
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 260;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 8);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 8, y - 8, 16, 16);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/** Concentric ring + spoke "tech medallion" for the bowl floor centre. */
export function makeGridTexture(accent: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);
  ctx.strokeStyle = hex(accent);
  ctx.lineCap = 'round';

  // Concentric rings.
  for (let r = 60; r <= 240; r += 36) {
    ctx.lineWidth = r === 240 ? 4 : 2;
    ctx.globalAlpha = 0.55 - (r / 240) * 0.25;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial spokes — long ones every 30°, short ticks in between.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * 90, 256 + Math.sin(a) * 90);
    ctx.lineTo(256 + Math.cos(a) * 240, 256 + Math.sin(a) * 240);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + Math.PI / 24;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200);
    ctx.lineTo(256 + Math.cos(a) * 240, 256 + Math.sin(a) * 240);
    ctx.stroke();
  }

  // Centre hot spot.
  ctx.globalAlpha = 1;
  const dot = ctx.createRadialGradient(256, 256, 0, 256, 256, 56);
  dot.addColorStop(0, hex(accent, 0.95));
  dot.addColorStop(0.5, hex(accent, 0.35));
  dot.addColorStop(1, hex(accent, 0));
  ctx.fillStyle = dot;
  ctx.fillRect(196, 196, 120, 120);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.center.set(0.5, 0.5);
  return tex;
}

/** Tiny mote sprite — soft dot for the ambient floating particles. */
export function makeMoteTexture(): THREE.Texture {
  const { c, ctx } = canvas(32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
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
