import * as THREE from 'three';

export const CARD_WIDTH = 1.0;
export const CARD_HEIGHT = 1.4;
export const CARD_THICKNESS = 0.014;
export const CARD_CORNER_RADIUS = 0.056;

export function createRoundedRectShape(
  width: number,
  height: number,
  radius: number,
): THREE.Shape {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(radius, hw, hh);
  const shape = new THREE.Shape();

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  return shape;
}

export function createRoundedRectPlaneGeometry(
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  cornerRadius = CARD_CORNER_RADIUS,
): THREE.BufferGeometry {
  const shape = createRoundedRectShape(width, height, cornerRadius);
  const geo = new THREE.ShapeGeometry(shape, 8);

  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv[i * 2] = x / width + 0.5;
    uv[i * 2 + 1] = y / height + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

export function createRoundedRectOutlineGeometry(
  width: number,
  height: number,
  borderThickness: number,
  cornerRadius: number,
): THREE.BufferGeometry {
  const outerW = width + borderThickness;
  const outerH = height + borderThickness;
  const innerW = Math.max(0.05, width - borderThickness);
  const innerH = Math.max(0.05, height - borderThickness);

  const outerShape = createRoundedRectShape(outerW, outerH, cornerRadius + borderThickness * 0.5);
  const innerHole = createRoundedRectShape(
    innerW,
    innerH,
    Math.max(0.01, cornerRadius - borderThickness * 0.5),
  );
  outerShape.holes.push(innerHole);

  const geo = new THREE.ShapeGeometry(outerShape, 8);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a rounded-rectangle 3D card BufferGeometry with 3 distinct material groups:
 *   Group 0: Front face (+Z)
 *   Group 1: Back face (-Z, upright when rotated PI around Y)
 *   Group 2: Beveled card edge rim
 */
export function createCardGeometry(
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  thickness = CARD_THICKNESS,
  cornerRadius = CARD_CORNER_RADIUS,
): THREE.BufferGeometry {
  const halfT = thickness * 0.5;
  const shape = createRoundedRectShape(width, height, cornerRadius);
  const curveSegments = 8;

  // 1. Front face (+Z)
  const frontNonIdx = new THREE.ShapeGeometry(shape, curveSegments).toNonIndexed();
  const frontPosAttr = frontNonIdx.attributes.position;
  const frontCount = frontPosAttr.count;
  const frontPos = new Float32Array(frontCount * 3);
  const frontNorm = new Float32Array(frontCount * 3);
  const frontUv = new Float32Array(frontCount * 2);

  for (let i = 0; i < frontCount; i++) {
    const x = frontPosAttr.getX(i);
    const y = frontPosAttr.getY(i);
    frontPos[i * 3] = x;
    frontPos[i * 3 + 1] = y;
    frontPos[i * 3 + 2] = halfT;

    frontNorm[i * 3] = 0;
    frontNorm[i * 3 + 1] = 0;
    frontNorm[i * 3 + 2] = 1;

    frontUv[i * 2] = x / width + 0.5;
    frontUv[i * 2 + 1] = y / height + 0.5;
  }

  // 2. Back face (-Z) — compute UVs before rotating 180° around Y
  const backNonIdx = new THREE.ShapeGeometry(shape, curveSegments).toNonIndexed();
  const backPosAttr = backNonIdx.attributes.position;
  const backCount = backPosAttr.count;
  const backPos = new Float32Array(backCount * 3);
  const backNorm = new Float32Array(backCount * 3);
  const backUv = new Float32Array(backCount * 2);

  // Reverse vertex winding per triangle or rotateY(PI) preserves front-facing CCW when viewed from -Z:
  // rotateY(PI) transforms (x, y, z) -> (-x, y, -z) and keeps determinant +1 (CCW from -Z!).
  for (let i = 0; i < backCount; i++) {
    const origX = backPosAttr.getX(i);
    const origY = backPosAttr.getY(i);

    backPos[i * 3] = -origX;
    backPos[i * 3 + 1] = origY;
    backPos[i * 3 + 2] = -halfT;

    backNorm[i * 3] = 0;
    backNorm[i * 3 + 1] = 0;
    backNorm[i * 3 + 2] = -1;

    backUv[i * 2] = origX / width + 0.5;
    backUv[i * 2 + 1] = origY / height + 0.5;
  }

  // 3. Edge rim connecting front (+halfT) and back (-halfT)
  const rawPts = shape.getPoints(curveSegments);
  const pts: THREE.Vector2[] = [];
  for (const pt of rawPts) {
    if (pts.length === 0 || pt.distanceToSquared(pts[pts.length - 1]) > 1e-8) {
      pts.push(pt);
    }
  }
  if (pts.length > 1 && pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-8) {
    pts.pop();
  }

  const sideVerts: number[] = [];
  const sideNorms: number[] = [];
  const sideUvs: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;

    // Outward normal for CCW perimeter
    const nx = dy / segLen;
    const ny = -dx / segLen;

    // Triangle 1: f0, b0, b1
    sideVerts.push(p0.x, p0.y, halfT);
    sideVerts.push(p0.x, p0.y, -halfT);
    sideVerts.push(p1.x, p1.y, -halfT);

    // Triangle 2: f0, b1, f1
    sideVerts.push(p0.x, p0.y, halfT);
    sideVerts.push(p1.x, p1.y, -halfT);
    sideVerts.push(p1.x, p1.y, halfT);

    for (let k = 0; k < 6; k++) {
      sideNorms.push(nx, ny, 0);
    }

    sideUvs.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
  }

  const sideCount = sideVerts.length / 3;
  const totalCount = frontCount + backCount + sideCount;

  const positions = new Float32Array(totalCount * 3);
  const normals = new Float32Array(totalCount * 3);
  const uvs = new Float32Array(totalCount * 2);

  positions.set(frontPos, 0);
  positions.set(backPos, frontCount * 3);
  positions.set(sideVerts, (frontCount + backCount) * 3);

  normals.set(frontNorm, 0);
  normals.set(backNorm, frontCount * 3);
  normals.set(sideNorms, (frontCount + backCount) * 3);

  uvs.set(frontUv, 0);
  uvs.set(backUv, frontCount * 2);
  uvs.set(sideUvs, (frontCount + backCount) * 2);

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  merged.clearGroups();
  merged.addGroup(0, frontCount, 0);
  merged.addGroup(frontCount, backCount, 1);
  merged.addGroup(frontCount + backCount, sideCount, 2);

  frontNonIdx.dispose();
  backNonIdx.dispose();

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createSparkleTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const c = S * 0.5;

  const grad = ctx.createRadialGradient(c, c, 1, c, c, c);
  grad.addColorStop(0, 'rgba(255, 255, 245, 1)');
  grad.addColorStop(0.25, 'rgba(255, 232, 145, 0.88)');
  grad.addColorStop(0.6, 'rgba(255, 198, 70, 0.28)');
  grad.addColorStop(1, 'rgba(255, 180, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // Crisp 4-point star flare
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.moveTo(c, 4);
  ctx.quadraticCurveTo(c + 3, c - 3, S - 4, c);
  ctx.quadraticCurveTo(c + 3, c + 3, c, S - 4);
  ctx.quadraticCurveTo(c - 3, c + 3, 4, c);
  ctx.quadraticCurveTo(c - 3, c - 3, c, 4);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
