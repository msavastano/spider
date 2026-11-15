import * as THREE from 'three';
import type { FeltTheme } from '../engine/types';
import { FELT_PALETTES, type FeltPalette } from './themes';

export interface TableTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderFeltDiffuse(palette: FeltPalette): HTMLCanvasElement {
  const W = 1024;
  const H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(1337);

  // Studio radial vignette base
  const radGrad = ctx.createRadialGradient(
    W * 0.5,
    H * 0.44,
    W * 0.08,
    W * 0.5,
    H * 0.5,
    W * 0.68,
  );
  radGrad.addColorStop(0, palette.centerColor);
  radGrad.addColorStop(0.56, palette.midColor);
  radGrad.addColorStop(1, palette.edgeColor);
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, W, H);

  if (palette.surfaceType === 'wood') {
    // Rich mahogany woodgrain planks & flowing grain curves
    const plankCount = 7;
    const plankH = H / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const y0 = p * plankH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, plankH);
      ctx.clip();

      // Subtle per-plank tone shift
      ctx.fillStyle = p % 2 === 0 ? 'rgba(255, 190, 140, 0.03)' : 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, y0, W, plankH);

      // Flowing grain striations
      const phase = rand() * Math.PI * 2;
      for (let g = 0; g < 68; g++) {
        const gy = y0 + (g / 68) * plankH;
        ctx.strokeStyle = g % 3 === 0 ? palette.fiberLight : palette.fiberDark;
        ctx.lineWidth = 0.9 + rand() * 1.8;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 32) {
          const wave =
            Math.sin(x * 0.008 + phase + g * 0.14) * 5.5 +
            Math.sin(x * 0.021 + g * 0.3) * 2.1;
          if (x === 0) ctx.moveTo(x, gy + wave);
          else ctx.lineTo(x, gy + wave);
        }
        ctx.stroke();
      }
      ctx.restore();

      // Subtle beveled plank seam
      if (p > 0) {
        ctx.fillStyle = 'rgba(10, 3, 1, 0.35)';
        ctx.fillRect(0, y0 - 1, W, 2);
      }
    }
  } else {
    // Casino wool baize woven fibers + soft mottled sheen
    ctx.lineWidth = 1;
    for (let i = 0; i < 6500; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const len = 3 + rand() * 7;
      const ang = rand() * Math.PI * 2;
      ctx.strokeStyle = i % 2 === 0 ? palette.fiberLight : palette.fiberDark;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Subtle woven diagonal crosshatch
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)';
    ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
  }

  // Soft outer rim vignette darkening for dramatic focus
  const outerVignette = ctx.createRadialGradient(
    W * 0.5,
    H * 0.48,
    W * 0.32,
    W * 0.5,
    H * 0.5,
    W * 0.74,
  );
  outerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  outerVignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = outerVignette;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}

function renderBumpCanvas(palette: FeltPalette): HTMLCanvasElement {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRand(9001);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);

  if (palette.surfaceType === 'wood') {
    for (let y = 0; y < S; y += 3) {
      const shade = Math.round(112 + rand() * 34);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, S, 2);
    }
    // Fine wood pores
    for (let i = 0; i < 900; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const w = 6 + rand() * 18;
      ctx.fillStyle = 'rgba(40,40,40,0.35)';
      ctx.fillRect(x, y, w, 1.5);
    }
  } else {
    // Tight woven felt micro-texture (tileable)
    for (let y = 0; y < S; y += 4) {
      for (let x = 0; x < S; x += 4) {
        const v = Math.round(114 + rand() * 28 + ((x + y) % 8 === 0 ? 10 : -8));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  return canvas;
}

export function createTableTextures(
  theme: FeltTheme,
  maxAnisotropy: number,
): TableTextureSet {
  const palette = FELT_PALETTES[theme];

  const diffuseCanvas = renderFeltDiffuse(palette);
  const map = new THREE.CanvasTexture(diffuseCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.max(1, maxAnisotropy);
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  const bumpCanvas = renderBumpCanvas(palette);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 4.5);
  bumpMap.anisotropy = Math.max(1, maxAnisotropy);
  bumpMap.needsUpdate = true;

  return {
    map,
    bumpMap,
    dispose: () => {
      map.dispose();
      bumpMap.dispose();
    },
  };
}

function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createSlotDecalTexture(
  kind: 'tableau' | 'foundation' | 'stock',
  theme: FeltTheme,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const palette = FELT_PALETTES[theme];
  const W = 256;
  const H = 358;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);

  // Soft recessed slot fill
  roundedPath(ctx, 8, 8, W - 16, H - 16, 16);
  ctx.fillStyle = palette.slotFill;
  ctx.fill();

  // Crisp stitched/recessed border
  ctx.strokeStyle = palette.slotStroke;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Inner faint hairline
  roundedPath(ctx, 18, 18, W - 36, H - 36, 11);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = palette.slotText;
  ctx.strokeStyle = palette.slotText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (kind === 'tableau') {
    // Subtle corner brackets + faint 'K' ring
    ctx.font = '700 44px "Georgia", serif';
    ctx.fillText('K', W * 0.5, H * 0.5);
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, 42, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (kind === 'foundation') {
    // Crown/Spade crest + A→K label
    ctx.font = '700 28px "Inter", system-ui, sans-serif';
    ctx.fillText('A → K', W * 0.5, H * 0.62);
    // Small diamond/crown icon above
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.34);
    ctx.lineTo(W * 0.5 + 22, H * 0.42);
    ctx.lineTo(W * 0.5, H * 0.5);
    ctx.lineTo(W * 0.5 - 22, H * 0.42);
    ctx.closePath();
    ctx.fill();
  } else {
    // Stock empty state: circular deal/spider emblem
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, 36, 0.3, Math.PI * 1.85);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = '700 24px "Inter", system-ui, sans-serif';
    ctx.fillText('STOCK', W * 0.5, H * 0.68);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createStockCounterTexture(
  count: number,
  theme: FeltTheme,
): THREE.CanvasTexture {
  const palette = FELT_PALETTES[theme];
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, S, S);

  // Dark glass pill disc
  ctx.beginPath();
  ctx.arc(S * 0.5, S * 0.5, 50, 0, Math.PI * 2);
  ctx.fillStyle = count > 0 ? 'rgba(12, 16, 26, 0.86)' : 'rgba(30, 36, 48, 0.65)';
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = count > 0 ? '#E8C468' : palette.slotStroke;
  ctx.stroke();

  ctx.fillStyle = count > 0 ? '#FFF7DF' : palette.slotText;
  ctx.font = '800 54px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), S * 0.5, S * 0.53);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
