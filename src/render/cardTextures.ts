import * as THREE from 'three';
import {
  RANK_LABELS,
  type CardBackTheme,
  type CardFaceTheme,
  type Rank,
  type Suit,
} from '../engine/types';
import {
  CARD_BACK_PALETTES,
  CARD_FACE_PALETTES,
  getSuitColor,
  type CardBackPalette,
  type CardFacePalette,
} from './themes';

export const CARD_TEX_WIDTH = 512;
export const CARD_TEX_HEIGHT = 717;

const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawSuitGlyph(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  size: number,
  fillStyle: string,
  rotationRad = 0,
  strokeHighlight?: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (rotationRad !== 0) {
    ctx.rotate(rotationRad);
  }
  const s = size * 0.5;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();

  if (suit === 'hearts') {
    ctx.moveTo(0, s * 0.88);
    ctx.bezierCurveTo(-s * 1.15, s * 0.16, -s * 1.08, -s * 0.96, -s * 0.48, -s * 0.92);
    ctx.bezierCurveTo(-s * 0.16, -s * 0.9, 0, -s * 0.56, 0, -s * 0.42);
    ctx.bezierCurveTo(0, -s * 0.56, s * 0.16, -s * 0.9, s * 0.48, -s * 0.92);
    ctx.bezierCurveTo(s * 1.08, -s * 0.96, s * 1.15, s * 0.16, 0, s * 0.88);
    ctx.closePath();
  } else if (suit === 'diamonds') {
    ctx.moveTo(0, -s * 1.02);
    ctx.quadraticCurveTo(s * 0.36, -s * 0.34, s * 0.88, 0);
    ctx.quadraticCurveTo(s * 0.36, s * 0.34, 0, s * 1.02);
    ctx.quadraticCurveTo(-s * 0.36, s * 0.34, -s * 0.88, 0);
    ctx.quadraticCurveTo(-s * 0.36, -s * 0.34, 0, -s * 1.02);
    ctx.closePath();
  } else if (suit === 'spades') {
    // Upper inverted heart body
    ctx.moveTo(0, -s * 0.98);
    ctx.bezierCurveTo(s * 0.98, -s * 0.18, s * 1.08, s * 0.62, s * 0.42, s * 0.62);
    ctx.bezierCurveTo(s * 0.18, s * 0.62, s * 0.08, s * 0.42, s * 0.06, s * 0.32);
    ctx.quadraticCurveTo(s * 0.12, s * 0.78, s * 0.34, s * 0.96);
    ctx.lineTo(-s * 0.34, s * 0.96);
    ctx.quadraticCurveTo(-s * 0.12, s * 0.78, -s * 0.06, s * 0.32);
    ctx.bezierCurveTo(-s * 0.08, s * 0.42, -s * 0.18, s * 0.62, -s * 0.42, s * 0.62);
    ctx.bezierCurveTo(-s * 1.08, s * 0.62, -s * 0.98, -s * 0.18, 0, -s * 0.98);
    ctx.closePath();
  } else {
    // Clubs: three balanced round lobes + flared stem
    const r = s * 0.42;
    const topY = -s * 0.44;
    const sideX = s * 0.46;
    const sideY = s * 0.14;
    ctx.arc(0, topY, r, Math.PI * 0.82, Math.PI * 0.18, false);
    ctx.arc(sideX, sideY, r, -Math.PI * 0.68, Math.PI * 0.65, false);
    ctx.quadraticCurveTo(s * 0.12, s * 0.36, s * 0.09, s * 0.48);
    ctx.quadraticCurveTo(s * 0.14, s * 0.8, s * 0.34, s * 0.96);
    ctx.lineTo(-s * 0.34, s * 0.96);
    ctx.quadraticCurveTo(-s * 0.14, s * 0.8, -s * 0.09, s * 0.48);
    ctx.quadraticCurveTo(-s * 0.12, s * 0.36, -s * 0.16, s * 0.34);
    ctx.arc(-sideX, sideY, r, Math.PI * 0.35, -Math.PI * 0.32, false);
    ctx.closePath();
  }

  ctx.fill();
  if (strokeHighlight) {
    ctx.strokeStyle = strokeHighlight;
    ctx.lineWidth = Math.max(1.5, size * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRankText(
  ctx: CanvasRenderingContext2D,
  label: string,
  centerX: number,
  centerY: number,
  fontSize: number,
  palette: CardFacePalette,
  color: string,
): void {
  ctx.save();
  ctx.font = `${palette.rankWeight} ${fontSize}px ${palette.rankFontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const metrics = ctx.measureText(label);
  const ascent =
    metrics.actualBoundingBoxAscent > 0 ? metrics.actualBoundingBoxAscent : fontSize * 0.72;
  const descent =
    metrics.actualBoundingBoxDescent >= 0 ? metrics.actualBoundingBoxDescent : fontSize * 0.04;
  const baselineY = centerY + (ascent - descent) * 0.5;

  ctx.translate(centerX, baselineY);
  if (label === '10') {
    ctx.scale(0.76, 1.0);
  }
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawHeaderBand(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  palette: CardFacePalette,
  suitColor: string,
): void {
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;
  const headerH = Math.round(H * 0.22); // 158px (~22%)
  const label = RANK_LABELS[rank];

  // Subtle top header tint
  ctx.save();
  roundedRectPath(ctx, 14, 14, W - 28, headerH - 14, 20);
  ctx.fillStyle = palette.headerBandBg;
  ctx.fill();

  // Optional modern accent top bar
  if (palette.modernStripe) {
    ctx.fillStyle = suitColor;
    ctx.globalAlpha = palette.isDark ? 0.55 : 0.24;
    ctx.fillRect(36, 18, W - 72, 6);
    ctx.globalAlpha = 1;
  }

  // Crisp subtle divider at bottom of top 22% header band
  ctx.strokeStyle = palette.headerDivider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(26, headerH);
  ctx.lineTo(W - 26, headerH);
  ctx.stroke();
  ctx.restore();

  const bandCenterY = Math.round(headerH * 0.54);
  const fontSize = palette.jumboLayout ? 92 : 82;
  const suitSize = palette.jumboLayout ? 68 : 60;

  // Top-Left: [Rank] + [Suit]
  const leftRankX = label === '10' ? 76 : 68;
  const leftSuitX = label === '10' ? 168 : 152;
  drawRankText(ctx, label, leftRankX, bandCenterY, fontSize, palette, suitColor);
  drawSuitGlyph(ctx, suit, leftSuitX, bandCenterY, suitSize, suitColor);

  // Top-Right: [Suit] + [Rank]
  const rightRankX = label === '10' ? W - 76 : W - 68;
  const rightSuitX = label === '10' ? W - 168 : W - 152;
  drawSuitGlyph(ctx, suit, rightSuitX, bandCenterY, suitSize, suitColor);
  drawRankText(ctx, label, rightRankX, bandCenterY, fontSize, palette, suitColor);
}

function drawBottomCornerIndices(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  palette: CardFacePalette,
  suitColor: string,
): void {
  if (palette.jumboLayout) {
    return;
  }
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;
  const label = RANK_LABELS[rank];

  const drawInvertedCorner = (cx: number, cy: number, suitOffset: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    drawRankText(ctx, label, 0, 0, 36, palette, suitColor);
    drawSuitGlyph(ctx, suit, suitOffset, 0, 28, suitColor);
    ctx.restore();
  };

  ctx.save();
  ctx.globalAlpha = 0.72;
  drawInvertedCorner(W - 56, H - 46, -42);
  drawInvertedCorner(56, H - 46, 42);
  ctx.restore();
}

// Normalized pip coordinates in center artwork box [0..1] x [0..1]
// [x, y, inverted]
type PipCoord = readonly [number, number, boolean];

const PIP_LAYOUTS: Record<number, readonly PipCoord[]> = {
  2: [
    [0.5, 0.14, false],
    [0.5, 0.86, true],
  ],
  3: [
    [0.5, 0.13, false],
    [0.5, 0.5, false],
    [0.5, 0.87, true],
  ],
  4: [
    [0.26, 0.15, false],
    [0.74, 0.15, false],
    [0.26, 0.85, true],
    [0.74, 0.85, true],
  ],
  5: [
    [0.26, 0.15, false],
    [0.74, 0.15, false],
    [0.5, 0.5, false],
    [0.26, 0.85, true],
    [0.74, 0.85, true],
  ],
  6: [
    [0.26, 0.14, false],
    [0.74, 0.14, false],
    [0.26, 0.5, false],
    [0.74, 0.5, false],
    [0.26, 0.86, true],
    [0.74, 0.86, true],
  ],
  7: [
    [0.26, 0.14, false],
    [0.74, 0.14, false],
    [0.5, 0.32, false],
    [0.26, 0.5, false],
    [0.74, 0.5, false],
    [0.26, 0.86, true],
    [0.74, 0.86, true],
  ],
  8: [
    [0.26, 0.14, false],
    [0.74, 0.14, false],
    [0.5, 0.32, false],
    [0.26, 0.5, false],
    [0.74, 0.5, false],
    [0.5, 0.68, true],
    [0.26, 0.86, true],
    [0.74, 0.86, true],
  ],
  9: [
    [0.25, 0.13, false],
    [0.75, 0.13, false],
    [0.25, 0.37, false],
    [0.75, 0.37, false],
    [0.5, 0.5, false],
    [0.25, 0.63, true],
    [0.75, 0.63, true],
    [0.25, 0.87, true],
    [0.75, 0.87, true],
  ],
  10: [
    [0.25, 0.13, false],
    [0.75, 0.13, false],
    [0.5, 0.25, false],
    [0.25, 0.37, false],
    [0.75, 0.37, false],
    [0.25, 0.63, true],
    [0.75, 0.63, true],
    [0.5, 0.75, true],
    [0.25, 0.87, true],
    [0.75, 0.87, true],
  ],
};

function drawAceCenter(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  palette: CardFacePalette,
  suitColor: string,
): void {
  const cx = CARD_TEX_WIDTH * 0.5;
  const cy = CARD_TEX_HEIGHT * 0.56;

  // Filigree halo behind Ace of Spades (or any Ace in midnight/classic)
  if (suit === 'spades' || palette.isDark) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = palette.isDark ? palette.courtFrame : palette.borderInner;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 116, Math.sin(a) * 116);
      ctx.lineTo(Math.cos(a) * 144, Math.sin(a) * 144);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 124, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const pipSize = palette.jumboLayout ? 248 : 206;
  drawSuitGlyph(
    ctx,
    suit,
    cx,
    cy,
    pipSize,
    suitColor,
    0,
    palette.isDark ? 'rgba(255,255,255,0.22)' : undefined,
  );
}

function drawNumberPips(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  palette: CardFacePalette,
  suitColor: string,
): void {
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;

  if (palette.jumboLayout) {
    // Jumbo mode: ultra-clean oversized center suit pip + subtle faint rank watermark
    const cx = W * 0.5;
    const cy = H * 0.56;
    drawSuitGlyph(ctx, suit, cx, cy, 224, suitColor);
    return;
  }

  const boxX = 86;
  const boxY = 194;
  const boxW = W - 172;
  const boxH = H - 252;

  const coords = PIP_LAYOUTS[rank] ?? [];
  const pipSize = rank >= 9 ? 76 : rank >= 6 ? 82 : 90;

  for (const [nx, ny, inverted] of coords) {
    const px = boxX + nx * boxW;
    const py = boxY + ny * boxH;
    drawSuitGlyph(ctx, suit, px, py, pipSize, suitColor, inverted ? Math.PI : 0);
  }
}

function drawCourtCrest(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  palette: CardFacePalette,
  suitColor: string,
): void {
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;
  const boxX = 68;
  const boxY = 190;
  const boxW = W - 136;
  const boxH = H - 246;
  const cx = boxX + boxW * 0.5;
  const cy = boxY + boxH * 0.5;

  ctx.save();
  // Court frame background
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 18);
  ctx.fillStyle = palette.courtBg;
  ctx.fill();

  // Subtle diagonal diamond lattice inside court frame
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.isDark
    ? 'rgba(212, 175, 96, 0.14)'
    : 'rgba(148, 128, 92, 0.12)';
  ctx.lineWidth = 1.5;
  const step = 28;
  for (let d = -boxH; d < boxW + boxH; d += step) {
    ctx.beginPath();
    ctx.moveTo(boxX + d, boxY);
    ctx.lineTo(boxX + d - boxH * 0.65, boxY + boxH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(boxX + d, boxY);
    ctx.lineTo(boxX + d + boxH * 0.65, boxY + boxH);
    ctx.stroke();
  }
  ctx.restore();

  // Double court border
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 18);
  ctx.strokeStyle = palette.courtFrame;
  ctx.lineWidth = 4;
  ctx.stroke();

  roundedRectPath(ctx, boxX + 9, boxY + 9, boxW - 18, boxH - 18, 12);
  ctx.strokeStyle = palette.courtAccent;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Geometric crest diamond medallion
  const medR = 112;
  ctx.save();
  ctx.translate(cx, cy);

  // Outer shield/octagram glow
  ctx.beginPath();
  ctx.moveTo(0, -medR * 1.15);
  ctx.lineTo(medR * 0.92, 0);
  ctx.lineTo(0, medR * 1.15);
  ctx.lineTo(-medR * 0.92, 0);
  ctx.closePath();
  ctx.fillStyle = palette.isDark ? 'rgba(18, 24, 40, 0.92)' : 'rgba(255, 253, 248, 0.94)';
  ctx.fill();
  ctx.strokeStyle = palette.courtFrame;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Inner circle crest
  ctx.beginPath();
  ctx.arc(0, 0, medR * 0.66, 0, Math.PI * 2);
  ctx.fillStyle = palette.isDark ? '#1D253B' : '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = palette.courtAccent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Distinct rank crown / emblem at top of medallion
  ctx.fillStyle = palette.courtAccent;
  ctx.strokeStyle = palette.courtFrame;
  ctx.lineWidth = 2;

  if (rank === 13) {
    // King: 5-point royal crown above central suit
    ctx.beginPath();
    ctx.moveTo(-54, -46);
    ctx.lineTo(-64, -92);
    ctx.lineTo(-30, -68);
    ctx.lineTo(0, -106);
    ctx.lineTo(30, -68);
    ctx.lineTo(64, -92);
    ctx.lineTo(54, -46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Jewel dots
    ctx.fillStyle = suitColor;
    for (const jx of [-64, 0, 64]) {
      const jy = jx === 0 ? -106 : -92;
      ctx.beginPath();
      ctx.arc(jx, jy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Crossed royal scepter accents below
    ctx.strokeStyle = palette.courtSecondary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-52, 72);
    ctx.lineTo(52, 102);
    ctx.moveTo(52, 72);
    ctx.lineTo(-52, 102);
    ctx.stroke();
  } else if (rank === 12) {
    // Queen: graceful floral coronet diadem
    ctx.beginPath();
    ctx.moveTo(-48, -48);
    ctx.quadraticCurveTo(-56, -86, -28, -76);
    ctx.quadraticCurveTo(0, -110, 0, -110);
    ctx.quadraticCurveTo(0, -110, 28, -76);
    ctx.quadraticCurveTo(56, -86, 48, -48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Floral rosette below
    ctx.strokeStyle = suitColor;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 14, 86 + Math.sin(a) * 14, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Jack: heraldic shield chevron & spear finial
    ctx.beginPath();
    ctx.moveTo(0, -108);
    ctx.lineTo(24, -74);
    ctx.lineTo(0, -52);
    ctx.lineTo(-24, -74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shield chevron below
    ctx.strokeStyle = palette.courtSecondary;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-42, 74);
    ctx.lineTo(0, 98);
    ctx.lineTo(42, 74);
    ctx.stroke();
  }

  // Central suit emblem inside crest
  drawSuitGlyph(ctx, suit, 0, 10, 82, suitColor);

  // Corner suit pips inside the court plaque
  drawSuitGlyph(ctx, suit, -boxW * 0.34, -boxH * 0.36, 42, suitColor);
  drawSuitGlyph(ctx, suit, boxW * 0.34, boxH * 0.36, 42, suitColor, Math.PI);

  // Subtle rank letter badges inside top-right & bottom-left of court plaque
  drawRankText(ctx, RANK_LABELS[rank], boxW * 0.34, -boxH * 0.36, 42, palette, suitColor);
  ctx.save();
  ctx.translate(-boxW * 0.34, boxH * 0.36);
  ctx.rotate(Math.PI);
  drawRankText(ctx, RANK_LABELS[rank], 0, 0, 42, palette, suitColor);
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

function renderCardFaceCanvas(
  suit: Suit,
  rank: Rank,
  faceTheme: CardFaceTheme,
  fourColorDeck: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEX_WIDTH;
  canvas.height = CARD_TEX_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const palette = CARD_FACE_PALETTES[faceTheme];
  const suitColor = getSuitColor(suit, fourColorDeck, faceTheme);
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;

  // Card stock background gradient (full bleed so UV edge stays clean)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, palette.paperTop);
  bgGrad.addColorStop(1, palette.paperBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer subtle card edge frame
  roundedRectPath(ctx, 8, 8, W - 16, H - 16, 26);
  ctx.strokeStyle = palette.borderOuter;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner hairline frame
  roundedRectPath(ctx, 18, 18, W - 36, H - 36, 18);
  ctx.strokeStyle = palette.borderInner;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 1. Bold Top ~22% Header Band (Rank+Suit left, Suit+Rank right)
  drawHeaderBand(ctx, rank, suit, palette, suitColor);

  // 2. Center pips or Court medallion
  if (rank === 1) {
    drawAceCenter(ctx, suit, palette, suitColor);
  } else if (rank >= 11) {
    drawCourtCrest(ctx, rank, suit, palette, suitColor);
  } else {
    drawNumberPips(ctx, rank, suit, palette, suitColor);
  }

  // 3. Subtle bottom corner indices
  drawBottomCornerIndices(ctx, rank, suit, palette, suitColor);

  return canvas;
}

function drawSpiderEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  goldColor: string,
  crimsonAccent: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // 8 articulated spider legs
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const legAngles = [-0.95, -0.5, -0.1, 0.35];
  for (const side of [-1, 1]) {
    for (let i = 0; i < legAngles.length; i++) {
      const a = legAngles[i];
      const bx = side * Math.cos(a) * radius * 0.25;
      const by = Math.sin(a) * radius * 0.2;
      const kx = side * Math.cos(a - 0.22 * (i < 2 ? 1 : -1)) * radius * 0.72;
      const ky = Math.sin(a) * radius * 0.65 - (i < 2 ? radius * 0.22 : -radius * 0.14);
      const tx = side * Math.cos(a) * radius * 1.05;
      const ty = Math.sin(a) * radius * 1.05 + (i - 1.5) * radius * 0.18;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(kx, ky);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  // Abdomen
  ctx.fillStyle = goldColor;
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.24, radius * 0.26, radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Crimson hourglass on abdomen
  ctx.fillStyle = crimsonAccent;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.11, radius * 0.1);
  ctx.lineTo(radius * 0.11, radius * 0.1);
  ctx.lineTo(0, radius * 0.24);
  ctx.lineTo(radius * 0.11, radius * 0.38);
  ctx.lineTo(-radius * 0.11, radius * 0.38);
  ctx.lineTo(0, radius * 0.24);
  ctx.closePath();
  ctx.fill();

  // Cephalothorax
  ctx.fillStyle = goldColor;
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.14, radius * 0.17, radius * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCardBackPattern(
  ctx: CanvasRenderingContext2D,
  palette: CardBackPalette,
  theme: CardBackTheme,
): void {
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const inset = 34;
  const innerW = W - inset * 2;
  const innerH = H - inset * 2;

  ctx.save();
  roundedRectPath(ctx, inset, inset, innerW, innerH, 16);
  ctx.clip();

  if (theme === 'spider-web') {
    // Radiating 12-spoke octagonal spider web
    ctx.strokeStyle = palette.detailStroke;
    ctx.lineWidth = 2;
    const spokes = 12;
    const maxR = Math.hypot(W, H) * 0.52;
    for (let i = 0; i < spokes; i++) {
      const a = (i * Math.PI * 2) / spokes;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      ctx.stroke();
    }
    const rings = [58, 102, 152, 208, 270, 338, 412];
    for (const r of rings) {
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a1 = (i * Math.PI * 2) / spokes;
        const a2 = ((i + 1) * Math.PI * 2) / spokes;
        const x1 = cx + Math.cos(a1) * r;
        const y1 = cy + Math.sin(a1) * r;
        const x2 = cx + Math.cos(a2) * r;
        const y2 = cy + Math.sin(a2) * r;
        const midA = (a1 + a2) * 0.5;
        const sagR = r * 0.88;
        const mx = cx + Math.cos(midA) * sagR;
        const my = cy + Math.sin(midA) * sagR;
        if (i === 0) ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Center medallion disc
    ctx.beginPath();
    ctx.arc(cx, cy, 68, 0, Math.PI * 2);
    ctx.fillStyle = '#0E1322';
    ctx.fill();
    ctx.strokeStyle = palette.metallicFoil;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    drawSpiderEmblem(ctx, cx, cy, 56, palette.metallicFoil, palette.secondaryAccent);
  } else if (theme === 'royal-crimson') {
    // Imperial diamond damask trellis
    ctx.strokeStyle = palette.detailStroke;
    ctx.lineWidth = 1.8;
    const step = 44;
    for (let y = inset - step; y < H; y += step) {
      for (let x = inset - step; x < W; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + step * 0.5, y);
        ctx.lineTo(x + step, y + step * 0.5);
        ctx.lineTo(x + step * 0.5, y + step);
        ctx.lineTo(x, y + step * 0.5);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(246, 215, 130, 0.22)';
        ctx.beginPath();
        ctx.arc(x + step * 0.5, y + step * 0.5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Central royal crest medallion
    ctx.fillStyle = '#530B17';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 90, 122, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.metallicFoil;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 74, 104, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    drawSuitGlyph(ctx, 'spades', cx, cy, 86, palette.metallicFoil);
  } else if (theme === 'emerald-guild') {
    // Interlocking quatrefoil & Art-Deco lattice
    ctx.strokeStyle = palette.detailStroke;
    ctx.lineWidth = 2;
    const cell = 56;
    for (let y = inset; y <= H - inset + cell; y += cell) {
      for (let x = inset; x <= W - inset + cell; x += cell) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Central compass star
    ctx.fillStyle = '#083324';
    ctx.beginPath();
    ctx.arc(cx, cy, 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.metallicFoil;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.fillStyle = palette.metallicFoil;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 === 0 ? 72 : 28;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (theme === 'celestial-gold') {
    // Astral starburst + concentric astrolabe rings
    ctx.strokeStyle = palette.detailStroke;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50);
      ctx.lineTo(cx + Math.cos(a) * 420, cy + Math.sin(a) * 420);
      ctx.stroke();
    }
    for (const r of [64, 118, 178, 242]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Deterministic stars
    ctx.fillStyle = palette.highlightColor;
    for (let i = 0; i < 42; i++) {
      const angle = i * 2.39996;
      const rad = 52 + ((i * 37) % 240);
      const sx = cx + Math.cos(angle) * rad;
      const sy = cy + Math.sin(angle) * rad * 1.28;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 3) + 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sunburst center
    ctx.fillStyle = palette.metallicFoil;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 === 0 ? 54 : 24;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // Minimal Slate: crisp micro-herringbone weave & platinum diamond monogram
    ctx.strokeStyle = palette.detailStroke;
    ctx.lineWidth = 1.5;
    const step = 22;
    for (let d = -H; d < W + H; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + H, H);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
    for (let d = -H; d < W + H; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, H);
      ctx.lineTo(d + H, 0);
      ctx.stroke();
    }
    // Center geometric diamond
    ctx.fillStyle = '#202736';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 76);
    ctx.lineTo(cx + 62, cy);
    ctx.lineTo(cx, cy + 76);
    ctx.lineTo(cx - 62, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = palette.metallicFoil;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - 48);
    ctx.lineTo(cx + 38, cy);
    ctx.lineTo(cx, cy + 48);
    ctx.lineTo(cx - 38, cy);
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function renderCardBackCanvas(backTheme: CardBackTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEX_WIDTH;
  canvas.height = CARD_TEX_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const palette = CARD_BACK_PALETTES[backTheme];
  const W = CARD_TEX_WIDTH;
  const H = CARD_TEX_HEIGHT;

  // White/ivory card margin
  ctx.fillStyle = palette.marginColor;
  ctx.fillRect(0, 0, W, H);

  // Inner dark back panel
  const grad = ctx.createRadialGradient(W * 0.5, H * 0.45, 30, W * 0.5, H * 0.5, H * 0.56);
  grad.addColorStop(0, palette.baseTop);
  grad.addColorStop(1, palette.baseBottom);
  roundedRectPath(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.fillStyle = grad;
  ctx.fill();

  // Pattern fill
  drawCardBackPattern(ctx, palette, backTheme);

  // Crisp double border around back artwork
  roundedRectPath(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.strokeStyle = palette.metallicFoil;
  ctx.lineWidth = 4;
  ctx.stroke();

  roundedRectPath(ctx, 34, 34, W - 68, H - 68, 14);
  ctx.strokeStyle = palette.detailStroke;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Four corner diamond finials
  const corners = [
    [52, 52],
    [W - 52, 52],
    [52, H - 52],
    [W - 52, H - 52],
  ];
  ctx.fillStyle = palette.metallicFoil;
  for (const [fx, fy] of corners) {
    ctx.beginPath();
    ctx.moveTo(fx, fy - 9);
    ctx.lineTo(fx + 9, fy);
    ctx.lineTo(fx, fy + 9);
    ctx.lineTo(fx - 9, fy);
    ctx.closePath();
    ctx.fill();
  }

  return canvas;
}

export class CardTextureManager {
  private faceCache = new Map<string, THREE.CanvasTexture>();
  private backCache = new Map<CardBackTheme, THREE.CanvasTexture>();
  private maxAnisotropy = 8;

  setMaxAnisotropy(anisotropy: number): void {
    const clamped = Math.max(1, Math.min(16, anisotropy));
    if (clamped === this.maxAnisotropy) return;
    this.maxAnisotropy = clamped;
    for (const tex of this.faceCache.values()) {
      tex.anisotropy = clamped;
      tex.needsUpdate = true;
    }
    for (const tex of this.backCache.values()) {
      tex.anisotropy = clamped;
      tex.needsUpdate = true;
    }
  }

  getFaceTexture(
    suit: Suit,
    rank: Rank,
    faceTheme: CardFaceTheme,
    fourColorDeck: boolean,
  ): THREE.CanvasTexture {
    const key = `${faceTheme}:${fourColorDeck ? '4c' : '2c'}:${suit}:${rank}`;
    const cached = this.faceCache.get(key);
    if (cached) return cached;

    const canvas = renderCardFaceCanvas(suit, rank, faceTheme, fourColorDeck);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.faceCache.set(key, tex);
    return tex;
  }

  getBackTexture(backTheme: CardBackTheme): THREE.CanvasTexture {
    const cached = this.backCache.get(backTheme);
    if (cached) return cached;

    const canvas = renderCardBackCanvas(backTheme);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    this.backCache.set(backTheme, tex);
    return tex;
  }

  prewarmTheme(
    faceTheme: CardFaceTheme,
    fourColorDeck: boolean,
    backTheme: CardBackTheme,
    suits: readonly Suit[] = SUITS,
  ): void {
    this.getBackTexture(backTheme);
    for (const suit of suits) {
      for (const rank of RANKS) {
        this.getFaceTexture(suit, rank, faceTheme, fourColorDeck);
      }
    }
  }

  dispose(): void {
    for (const tex of this.faceCache.values()) {
      tex.dispose();
    }
    this.faceCache.clear();
    for (const tex of this.backCache.values()) {
      tex.dispose();
    }
    this.backCache.clear();
  }
}
