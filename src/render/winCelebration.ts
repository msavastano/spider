import * as THREE from 'three';
import type {
  CardBackTheme,
  CardFaceTheme,
  GameState,
  Rank,
  Suit,
} from '../engine/types';
import { CARD_FACE_PALETTES } from './themes';
import type { CardTextureManager } from './cardTextures';
import { CARD_HEIGHT, CARD_WIDTH } from './cardGeometry';

export interface CelebrationBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cardScale: number;
  foundationPositions: THREE.Vector3[];
}

interface FlyingCard {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  trailTimer: number;
  age: number;
  suit: Suit;
  rank: Rank;
}

interface TrailGhost {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  active: boolean;
}

interface ConfettiParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  scaleX: number;
  scaleY: number;
  flutterPhase: number;
}

const SUIT_CYCLE: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const CONFETTI_COUNT = 220;
const MAX_TRAIL_POOL = 110;
const MAX_FLYING_CARDS = 14;

export class WinCelebrationManager {
  private group = new THREE.Group();
  private active = false;
  private elapsed = 0;
  private launchTimer = 0;
  private launchIndex = 0;

  private cardGeometry: THREE.BufferGeometry;
  private textures: CardTextureManager;
  private bounds: CelebrationBounds;

  private faceTheme: CardFaceTheme = 'classic';
  private backTheme: CardBackTheme = 'spider-web';
  private fourColorDeck = false;

  private sourceCards: Array<{ suit: Suit; rank: Rank; originIdx: number }> = [];
  private flyingCards: FlyingCard[] = [];
  private trailPool: TrailGhost[] = [];
  private trailCursor = 0;
  private trailZSeq = 0;

  private confettiGeo: THREE.PlaneGeometry;
  private confettiMat: THREE.MeshStandardMaterial;
  private confettiMesh: THREE.InstancedMesh;
  private confettiParticles: ConfettiParticle[] = [];
  private dummy = new THREE.Object3D();

  constructor(
    parentScene: THREE.Scene,
    cardGeometry: THREE.BufferGeometry,
    textures: CardTextureManager,
    initialBounds: CelebrationBounds,
  ) {
    this.cardGeometry = cardGeometry;
    this.textures = textures;
    this.bounds = initialBounds;
    this.group.visible = false;
    parentScene.add(this.group);

    this.confettiGeo = new THREE.PlaneGeometry(0.16, 0.095);
    this.confettiMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.72,
      side: THREE.DoubleSide,
    });
    this.confettiMesh = new THREE.InstancedMesh(
      this.confettiGeo,
      this.confettiMat,
      CONFETTI_COUNT,
    );
    this.confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confettiMesh.frustumCulled = false;

    const paletteColors = [
      new THREE.Color(0xffd54f),
      new THREE.Color(0xfff0a8),
      new THREE.Color(0x34d399),
      new THREE.Color(0x60a5fa),
      new THREE.Color(0xfb7185),
      new THREE.Color(0xfbbf24),
    ];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      this.confettiMesh.setColorAt(i, paletteColors[i % paletteColors.length]);
    }
    if (this.confettiMesh.instanceColor) {
      this.confettiMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.confettiMesh);
  }

  isRunning(): boolean {
    return this.active;
  }

  updateBounds(bounds: CelebrationBounds): void {
    this.bounds = bounds;
  }

  setAppearance(
    faceTheme: CardFaceTheme,
    backTheme: CardBackTheme,
    fourColorDeck: boolean,
  ): void {
    this.faceTheme = faceTheme;
    this.backTheme = backTheme;
    this.fourColorDeck = fourColorDeck;
  }

  start(
    state: GameState,
    faceTheme: CardFaceTheme,
    backTheme: CardBackTheme,
    fourColorDeck: boolean,
  ): void {
    this.stop();

    this.faceTheme = faceTheme;
    this.backTheme = backTheme;
    this.fourColorDeck = fourColorDeck;
    this.active = true;
    this.elapsed = 0;
    this.launchTimer = 0;
    this.launchIndex = 0;
    this.trailCursor = 0;
    this.trailZSeq = 0;
    this.group.visible = true;

    // Build source launch queue from completed foundations (K down to A)
    this.sourceCards = [];
    const foundCount = Math.max(1, this.bounds.foundationPositions.length);
    if (state.foundations.length > 0) {
      for (let rankNum = 13; rankNum >= 1; rankNum--) {
        for (let f = 0; f < state.foundations.length; f++) {
          const pile = state.foundations[f];
          this.sourceCards.push({
            suit: pile.suit,
            rank: rankNum as Rank,
            originIdx: f % foundCount,
          });
        }
      }
    } else {
      for (let rankNum = 13; rankNum >= 1; rankNum--) {
        for (let s = 0; s < SUIT_CYCLE.length; s++) {
          this.sourceCards.push({
            suit: SUIT_CYCLE[s],
            rank: rankNum as Rank,
            originIdx: s % foundCount,
          });
        }
      }
    }

    // Initialize trail pool
    const backTex = this.textures.getBackTexture(this.backTheme);
    const edgeColor = CARD_FACE_PALETTES[this.faceTheme].edgeColor;
    const sharedBackMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.45,
      metalness: 0.05,
    });
    const sharedEdgeMat = new THREE.MeshStandardMaterial({
      color: edgeColor,
      roughness: 0.55,
      metalness: 0.04,
    });

    for (let i = 0; i < MAX_TRAIL_POOL; i++) {
      const frontMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0.02,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(this.cardGeometry, [
        frontMat,
        sharedBackMat,
        sharedEdgeMat,
      ]);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      this.trailPool.push({
        mesh,
        age: 0,
        maxAge: 1.65,
        active: false,
      });
    }

    // Initialize confetti bursts
    this.confettiParticles = [];
    const spanX = Math.max(6, this.bounds.maxX - this.bounds.minX);
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const origin =
        this.bounds.foundationPositions[
          i % Math.max(1, this.bounds.foundationPositions.length)
        ] ?? new THREE.Vector3(0, this.bounds.maxY * 0.7, 0.4);
      const spreadX = origin.x + (Math.random() - 0.5) * spanX * 0.65;
      const spreadY = origin.y + (Math.random() - 0.5) * 1.4;
      this.confettiParticles.push({
        pos: new THREE.Vector3(spreadX, spreadY, 0.25 + Math.random() * 2.2),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4.5,
          -(1.2 + Math.random() * 3.8),
          2.2 + Math.random() * 5.2,
        ),
        rot: new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ),
        angVel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
        ),
        scaleX: 0.75 + Math.random() * 0.85,
        scaleY: 0.75 + Math.random() * 0.85,
        flutterPhase: Math.random() * Math.PI * 2,
      });
    }

    // Launch initial pair right away
    this.spawnCard();
    this.spawnCard();
  }

  stop(): void {
    this.active = false;
    this.group.visible = false;

    for (const fc of this.flyingCards) {
      this.group.remove(fc.mesh);
      const mats = fc.mesh.material as THREE.Material[];
      for (const m of mats) m.dispose();
    }
    this.flyingCards = [];

    const disposedShared = new Set<THREE.Material>();
    for (const tg of this.trailPool) {
      this.group.remove(tg.mesh);
      const mats = tg.mesh.material as THREE.Material[];
      for (const m of mats) {
        if (!disposedShared.has(m)) {
          m.dispose();
          disposedShared.add(m);
        }
      }
    }
    this.trailPool = [];
    this.confettiParticles = [];
  }

  private spawnCard(): void {
    if (this.sourceCards.length === 0) return;
    if (this.flyingCards.length >= MAX_FLYING_CARDS) {
      const oldest = this.flyingCards.shift();
      if (oldest) {
        this.group.remove(oldest.mesh);
        const mats = oldest.mesh.material as THREE.Material[];
        for (const m of mats) m.dispose();
      }
    }

    const spec = this.sourceCards[this.launchIndex % this.sourceCards.length];
    this.launchIndex++;

    const origin =
      this.bounds.foundationPositions[
        spec.originIdx % Math.max(1, this.bounds.foundationPositions.length)
      ] ?? new THREE.Vector3(0, this.bounds.maxY * 0.75, 0.35);

    const faceTex = this.textures.getFaceTexture(
      spec.suit,
      spec.rank,
      this.faceTheme,
      this.fourColorDeck,
    );
    const backTex = this.textures.getBackTexture(this.backTheme);
    const edgeColor = CARD_FACE_PALETTES[this.faceTheme].edgeColor;

    const mesh = new THREE.Mesh(this.cardGeometry, [
      new THREE.MeshStandardMaterial({
        map: faceTex,
        roughness: 0.34,
        metalness: 0.02,
      }),
      new THREE.MeshStandardMaterial({
        map: backTex,
        roughness: 0.44,
        metalness: 0.04,
      }),
      new THREE.MeshStandardMaterial({
        color: edgeColor,
        roughness: 0.55,
        metalness: 0.04,
      }),
    ]);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.scale.setScalar(this.bounds.cardScale);

    const dirSign =
      origin.x > (this.bounds.minX + this.bounds.maxX) * 0.5
        ? -1
        : Math.random() < 0.5
          ? -1
          : 1;
    const vx = dirSign * (2.6 + Math.random() * 4.4);
    const vy = -(0.5 + Math.random() * 2.4);
    const vz = 3.8 + Math.random() * 4.2;

    const pos = new THREE.Vector3(origin.x, origin.y, origin.z + 0.16);
    mesh.position.copy(pos);
    this.group.add(mesh);

    this.flyingCards.push({
      mesh,
      pos,
      vel: new THREE.Vector3(vx, vy, vz),
      rot: new THREE.Euler(0, 0, (Math.random() - 0.5) * 0.2),
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 4.5,
      ),
      trailTimer: 0,
      age: 0,
      suit: spec.suit,
      rank: spec.rank,
    });
  }

  private emitTrailGhost(fc: FlyingCard): void {
    if (this.trailPool.length === 0) return;
    const slot = this.trailPool[this.trailCursor];
    this.trailCursor = (this.trailCursor + 1) % this.trailPool.length;

    const faceTex = this.textures.getFaceTexture(
      fc.suit,
      fc.rank,
      this.faceTheme,
      this.fourColorDeck,
    );
    const mats = slot.mesh.material as THREE.MeshStandardMaterial[];
    mats[0].map = faceTex;
    mats[0].opacity = 0.86;
    mats[0].needsUpdate = true;

    this.trailZSeq = (this.trailZSeq + 1) % 60;
    slot.mesh.position.set(fc.pos.x, fc.pos.y, Math.max(0.03, fc.pos.z - 0.015 + this.trailZSeq * 0.0005));
    slot.mesh.rotation.copy(fc.rot);
    slot.mesh.scale.setScalar(this.bounds.cardScale);
    slot.mesh.visible = true;
    slot.age = 0;
    slot.active = true;
  }

  update(dt: number): void {
    if (!this.active) return;

    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;
    this.launchTimer += safeDt;

    if (this.launchTimer >= 0.24) {
      this.launchTimer = 0;
      this.spawnCard();
    }

    const scale = this.bounds.cardScale;
    const halfW = CARD_WIDTH * scale * 0.5;
    const halfH = CARD_HEIGHT * scale * 0.5;
    const floorY = this.bounds.minY + halfH * 0.92;
    const leftWall = this.bounds.minX - halfW * 1.4;
    const rightWall = this.bounds.maxX + halfW * 1.4;

    // Update bouncing cards
    for (let i = this.flyingCards.length - 1; i >= 0; i--) {
      const fc = this.flyingCards[i];
      fc.age += safeDt;
      fc.trailTimer += safeDt;

      // Gravity in -Y (screen cascade) and -Z (felt surface bounce)
      fc.vel.y -= 11.2 * safeDt;
      fc.vel.z -= 18.5 * safeDt;

      fc.pos.x += fc.vel.x * safeDt;
      fc.pos.y += fc.vel.y * safeDt;
      fc.pos.z += fc.vel.z * safeDt;

      // Felt table bounce (Z = 0)
      if (fc.pos.z < 0.06) {
        fc.pos.z = 0.06;
        fc.vel.z = Math.abs(fc.vel.z) * 0.76;
        if (fc.vel.z < 1.8) fc.vel.z = 2.6 + Math.random() * 2.0;
      }

      // Bottom edge Solitaire bounce (Y = floorY)
      if (fc.pos.y < floorY) {
        fc.pos.y = floorY;
        fc.vel.y = Math.abs(fc.vel.y) * 0.82 + 1.4;
        fc.vel.z = Math.max(fc.vel.z, 2.2 + Math.random() * 2.5);
        fc.angVel.z = (Math.random() - 0.5) * 6.0;
      }

      fc.rot.x += fc.angVel.x * safeDt;
      fc.rot.y += fc.angVel.y * safeDt;
      fc.rot.z += fc.angVel.z * safeDt;

      // Dampen extreme flip so card face stays legible most of the bounce
      fc.rot.x *= 0.985;
      fc.rot.y *= 0.985;

      fc.mesh.position.copy(fc.pos);
      fc.mesh.rotation.copy(fc.rot);
      fc.mesh.scale.setScalar(scale);

      if (fc.trailTimer >= 0.036) {
        fc.trailTimer = 0;
        this.emitTrailGhost(fc);
      }

      // Recycle once well past horizontal screen bounds or old
      if (fc.pos.x < leftWall || fc.pos.x > rightWall || fc.age > 6.5) {
        this.group.remove(fc.mesh);
        const mats = fc.mesh.material as THREE.Material[];
        for (const m of mats) m.dispose();
        this.flyingCards.splice(i, 1);
      }
    }

    // Update trail ghosts
    for (const tg of this.trailPool) {
      if (!tg.active) continue;
      tg.age += safeDt;
      const t = tg.age / tg.maxAge;
      if (t >= 1) {
        tg.active = false;
        tg.mesh.visible = false;
        continue;
      }
      const mats = tg.mesh.material as THREE.MeshStandardMaterial[];
      mats[0].opacity = 0.82 * (1 - t * t);
    }

    // Update golden confetti particles
    const spanX = Math.max(8, this.bounds.maxX - this.bounds.minX);
    for (let i = 0; i < this.confettiParticles.length; i++) {
      const p = this.confettiParticles[i];
      p.vel.z -= 6.5 * safeDt;
      p.vel.y -= 2.8 * safeDt;
      p.vel.x += Math.sin(this.elapsed * 3.2 + p.flutterPhase) * 2.4 * safeDt;

      p.pos.addScaledVector(p.vel, safeDt);
      p.rot.x += p.angVel.x * safeDt;
      p.rot.y += p.angVel.y * safeDt;
      p.rot.z += p.angVel.z * safeDt;

      if (p.pos.z < 0.05) {
        p.pos.z = 0.05;
        p.vel.z = Math.abs(p.vel.z) * 0.55;
      }

      if (p.pos.y < this.bounds.minY - 0.8) {
        p.pos.set(
          this.bounds.minX + Math.random() * spanX,
          this.bounds.maxY + 0.5 + Math.random() * 1.0,
          1.2 + Math.random() * 2.6,
        );
        p.vel.set(
          (Math.random() - 0.5) * 3.5,
          -(1.5 + Math.random() * 2.8),
          0.5 + Math.random() * 2.8,
        );
      }

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.set(p.scaleX * scale, p.scaleY * scale, 1);
      this.dummy.updateMatrix();
      this.confettiMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.confettiMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.stop();
    this.confettiGeo.dispose();
    this.confettiMat.dispose();
    this.confettiMesh.dispose();
    this.group.parent?.remove(this.group);
  }
}
