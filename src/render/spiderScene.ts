import * as THREE from 'three';
import {
  getDeckLayoutSpec,
  type Card,
  type FeltTheme,
  type GameState,
  type HintMove,
  type MoveAction,
  type Rank,
  type Suit,
  type UserSettings,
} from '../engine/types';
import type {
  SceneCallbacks,
  SceneSoundEvent,
  SelectionHighlight,
  SpiderSceneController,
} from './sceneTypes';
import {
  CARD_FACE_PALETTES,
  FELT_PALETTES,
  getAnimationSpeedMultiplier,
  getCameraTiltDeg,
} from './themes';
import { CardTextureManager } from './cardTextures';
import {
  createSlotDecalTexture,
  createStockCounterTexture,
  createTableTextures,
  type TableTextureSet,
} from './tableTextures';
import {
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_THICKNESS,
  CARD_WIDTH,
  createCardGeometry,
  createRoundedRectOutlineGeometry,
  createRoundedRectPlaneGeometry,
  createSparkleTexture,
} from './cardGeometry';
import { WinCelebrationManager } from './winCelebration';

const BASE_CARD_Z = 0.022;
const CARD_Z_STEP = 0.018;
const CAMERA_FOV_DEG = 38;

interface CardLocationTableau {
  zone: 'tableau';
  col: number;
  index: number;
}
interface CardLocationStock {
  zone: 'stock';
  batch: number;
  cardOffset: number;
}
interface CardLocationFoundation {
  zone: 'foundation';
  foundationIndex: number;
  cardOffset: number;
}
type CardLocation =
  | CardLocationTableau
  | CardLocationStock
  | CardLocationFoundation;

interface CardEntity {
  id: number;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  mesh: THREE.Mesh;
  frontMat: THREE.MeshStandardMaterial;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentRot: THREE.Euler;
  targetRot: THREE.Euler;
  currentScale: number;
  targetScale: number;
  isLocked: boolean;
  dimBlend: number;
  isSelected: boolean;
  pulseElapsed: number;
  pulseDuration: number;
  location: CardLocation;
}

interface FlightWaypoint {
  pos: THREE.Vector3;
  rotY: number;
  scale: number;
  duration: number;
  peakZ: number;
}

interface CardFlight {
  cardId: number;
  delay: number;
  elapsed: number;
  duration: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startRot: THREE.Euler;
  endRot: THREE.Euler;
  startScale: number;
  endScale: number;
  peakZ: number;
  bankRoll: number;
  flipDelayFrac: number;
  nextStage?: FlightWaypoint;
  soundAtStart?: SceneSoundEvent;
  soundAtLand?: SceneSoundEvent;
  sparkleOnLand?: boolean;
  started: boolean;
  finished: boolean;
}

interface DragState {
  fromCol: number;
  fromIndex: number;
  cardIds: number[];
  leadOffset: THREE.Vector2;
  leadTargetPos: THREE.Vector3;
  prevLeadPos: THREE.Vector3;
  vel: THREE.Vector2;
  stepY: number;
  hoverCol: number | null;
  hoverIsSameSuit: boolean;
}

interface PressTargetCard {
  type: 'card';
  col: number;
  index: number;
  cardId: number;
  isMovable: boolean;
}
interface PressTargetStock {
  type: 'stock';
}
interface PressTargetDest {
  type: 'destination';
  toCol: number;
}
interface PressTargetEmpty {
  type: 'empty';
}
type PressTarget =
  | PressTargetCard
  | PressTargetStock
  | PressTargetDest
  | PressTargetEmpty;

interface SelectionTargetVisual {
  toCol: number;
  padGroup: THREE.Group;
  hitMesh: THREE.Mesh;
  outlineMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  arcMesh: THREE.Mesh;
  arcMat: THREE.MeshBasicMaterial;
  ghostMesh: THREE.Mesh;
  ghostMat: THREE.MeshBasicMaterial;
  curve: THREE.CubicBezierCurve3;
  baseColor: THREE.Color;
  phaseOffset: number;
}

interface SparkleParticle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  baseScale: number;
  active: boolean;
}

interface ComputedLayout {
  numCols: number;
  numFoundations: number;
  colPitch: number;
  boardMinX: number;
  boardMaxX: number;
  boardMinY: number;
  boardMaxY: number;
  topRowY: number;
  tableauTopY: number;
  tableauMinBottomY: number;
  foundationScale: number;
  stockAnchorX: number;
  stockFanDir: number;
  colCentersX: number[];
  foundationPositions: THREE.Vector3[];
  camDist: number;
  camCenterY: number;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class SpiderScene implements SpiderSceneController {
  private callbacks: SceneCallbacks;
  private settings: UserSettings;

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 16 / 9, 1.0, 90);

  private cardTextures = new CardTextureManager();
  private cardGeometry = createCardGeometry(
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_THICKNESS,
    CARD_CORNER_RADIUS,
  );
  private padOutlineGeo = createRoundedRectOutlineGeometry(
    CARD_WIDTH * 1.03,
    CARD_HEIGHT * 1.025,
    0.045,
    CARD_CORNER_RADIUS,
  );
  private padPlaneGeo = createRoundedRectPlaneGeometry(
    CARD_WIDTH,
    CARD_HEIGHT,
    CARD_CORNER_RADIUS,
  );
  private hitPlaneGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.08, CARD_HEIGHT * 1.08);
  private sparkleTexture = createSparkleTexture();

  private sharedBackMat!: THREE.MeshStandardMaterial;
  private sharedEdgeMat!: THREE.MeshStandardMaterial;

  // Lighting & Table
  private ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  private keyLight = new THREE.DirectionalLight(0xfff8eb, 1.35);
  private fillLight = new THREE.DirectionalLight(0xb7e4cf, 0.48);
  private rimLight = new THREE.DirectionalLight(0x82e6b8, 0.35);

  private tableMesh: THREE.Mesh;
  private tableMat: THREE.MeshStandardMaterial;
  private tableTextures: TableTextureSet | null = null;

  private slotGroup = new THREE.Group();
  private tableauPadMeshes: THREE.Mesh[] = [];
  private foundationPadMeshes: THREE.Mesh[] = [];
  private stockPadMesh: THREE.Mesh | null = null;
  private stockCounterMesh: THREE.Mesh | null = null;
  private stockCounterTex: THREE.CanvasTexture | null = null;
  private slotTextures: THREE.CanvasTexture[] = [];

  private cardsGroup = new THREE.Group();
  private cardEntities = new Map<number, CardEntity>();
  private flights = new Map<number, CardFlight>();

  // Drag hover glow pad
  private dragHoverPad: THREE.Group;
  private dragHoverOutlineMat: THREE.MeshBasicMaterial;
  private dragHoverFillMat: THREE.MeshBasicMaterial;

  // Selection targets & multi-destination tracers
  private selectionGroup = new THREE.Group();
  private selectionRunOutline: THREE.Mesh;
  private selectionRunOutlineMat: THREE.MeshBasicMaterial;
  private activeSelection: SelectionHighlight | null = null;
  private selectionVisuals: SelectionTargetVisual[] = [];
  private selectionElapsed = 0;

  // Hint ghost & Bezier path
  private hintGroup = new THREE.Group();
  private activeHint: HintMove | null = null;
  private hintElapsed = 0;
  private hintGhostGroup = new THREE.Group();
  private hintGhostMats: THREE.MeshBasicMaterial[] = [];
  private hintCurve: THREE.CubicBezierCurve3 | null = null;
  private hintArcMesh: THREE.Mesh | null = null;
  private hintArcMat: THREE.MeshBasicMaterial | null = null;
  private hintSourceOutline: THREE.Mesh | null = null;
  private hintDestOutline: THREE.Mesh | null = null;
  private hintDestPos = new THREE.Vector3();
  private hintStockRing: THREE.Mesh | null = null;

  // Sparkle burst particles
  private sparkleGroup = new THREE.Group();
  private sparklePool: SparkleParticle[] = [];
  private sparkleCursor = 0;

  // Win celebration
  private winCelebration: WinCelebrationManager;

  // State & layout
  private currentState: GameState | null = null;
  private lastLayout: ComputedLayout;
  private currentTiltDeg: number;
  private targetTiltDeg: number;

  // Pointer & drag interaction
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.82);
  private pressTarget: PressTarget | null = null;
  private pressStartClient = new THREE.Vector2();
  private pressActivePointerId: number | null = null;
  private dragState: DragState | null = null;
  private pendingDropSnap = false;
  private lastClickInfo: { col: number; index: number; time: number } | null = null;

  // Loop & observer
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private clockElapsed = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  // Bound event listeners
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundWindowResize: () => void;

  constructor(callbacks: SceneCallbacks, initialSettings: UserSettings) {
    this.callbacks = callbacks;
    this.settings = { ...initialSettings };
    this.currentTiltDeg = getCameraTiltDeg(this.settings);
    this.targetTiltDeg = this.currentTiltDeg;

    this.scene.fog = null;

    // Shared card back & edge materials
    const backTex = this.cardTextures.getBackTexture(this.settings.cardBackTheme);
    const facePalette = CARD_FACE_PALETTES[this.settings.cardFaceTheme];
    this.sharedBackMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.44,
      metalness: 0.04,
    });
    this.sharedEdgeMat = new THREE.MeshStandardMaterial({
      color: facePalette.edgeColor,
      roughness: 0.56,
      metalness: 0.03,
    });

    // Lights
    this.scene.add(this.ambientLight);

    this.keyLight.position.set(-5.5, 8.5, 16.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.00045;
    this.keyLight.shadow.normalBias = 0.022;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 48;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight.position.set(7.5, -5.0, 11.0);
    this.scene.add(this.fillLight);

    this.rimLight.position.set(0, 10, 6);
    this.scene.add(this.rimLight);

    // Tabletop plane (1x1 unit scaled dynamically to frame active playfield vignette)
    const tableGeo = new THREE.PlaneGeometry(1, 1);
    this.tableMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.02,
      bumpScale: 0.02,
    });
    this.tableMesh = new THREE.Mesh(tableGeo, this.tableMat);
    this.tableMesh.position.set(0, 0, 0);
    this.tableMesh.receiveShadow = true;
    this.scene.add(this.tableMesh);

    this.scene.add(this.slotGroup);
    this.scene.add(this.cardsGroup);

    // Drag hover highlight pad
    this.dragHoverPad = new THREE.Group();
    this.dragHoverOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.dragHoverFillMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const dragOutlineMesh = new THREE.Mesh(this.padOutlineGeo, this.dragHoverOutlineMat);
    const dragFillMesh = new THREE.Mesh(this.padPlaneGeo, this.dragHoverFillMat);
    dragFillMesh.position.z = -0.002;
    this.dragHoverPad.add(dragOutlineMesh, dragFillMesh);
    this.dragHoverPad.visible = false;
    this.scene.add(this.dragHoverPad);

    // Selection highlights group
    this.selectionRunOutlineMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.selectionRunOutline = new THREE.Mesh(
      this.padOutlineGeo,
      this.selectionRunOutlineMat,
    );
    this.selectionRunOutline.visible = false;
    this.selectionGroup.add(this.selectionRunOutline);
    this.scene.add(this.selectionGroup);

    // Hint group
    this.hintGroup.add(this.hintGhostGroup);
    this.scene.add(this.hintGroup);

    // Sparkle particle pool
    for (let i = 0; i < 72; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.sparkleTexture,
        color: 0xffe07d,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.sparkleGroup.add(sprite);
      this.sparklePool.push({
        sprite,
        mat,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 0.8,
        baseScale: 0.25,
        active: false,
      });
    }
    this.scene.add(this.sparkleGroup);

    this.lastLayout = this.computeLayout(1280, 720, 10, 8, this.currentTiltDeg);
    this.winCelebration = new WinCelebrationManager(
      this.scene,
      this.cardGeometry,
      this.cardTextures,
      {
        minX: this.lastLayout.boardMinX,
        maxX: this.lastLayout.boardMaxX,
        minY: this.lastLayout.boardMinY,
        maxY: this.lastLayout.boardMaxY,
        cardScale: 1,
        foundationPositions: this.lastLayout.foundationPositions,
      },
    );

    this.applyFeltAppearance(this.settings.feltTheme);
    this.rebuildTableSlots();

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    this.boundWindowResize = () => this.resize();
  }

  mount(container: HTMLElement): void {
    if (this.disposed) return;
    if (this.container === container && this.renderer) return;

    this.container = container;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    container.innerHTML = '';
    container.appendChild(canvas);
    this.renderer = renderer;

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.cardTextures.setMaxAnisotropy(maxAniso);
    this.applyFeltAppearance(this.settings.feltTheme);

    canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointercancel', this.boundPointerUp);
    canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('resize', this.boundWindowResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }

    this.resize();
    this.startLoop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.boundPointerDown);
      canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerUp);
    window.removeEventListener('resize', this.boundWindowResize);

    this.clearHint();
    this.showSelectionTargets(null);
    this.winCelebration.dispose();

    for (const entity of this.cardEntities.values()) {
      this.cardsGroup.remove(entity.mesh);
      entity.frontMat.dispose();
    }
    this.cardEntities.clear();

    this.sharedBackMat.dispose();
    this.sharedEdgeMat.dispose();
    this.cardTextures.dispose();

    this.tableTextures?.dispose();
    this.tableTextures = null;
    this.tableMat.dispose();
    this.tableMesh.geometry.dispose();

    this.clearSlotMeshes();
    this.stockCounterTex?.dispose();
    this.stockCounterTex = null;

    this.dragHoverOutlineMat.dispose();
    this.dragHoverFillMat.dispose();
    this.selectionRunOutlineMat.dispose();

    for (const sp of this.sparklePool) {
      sp.mat.dispose();
    }
    this.sparklePool = [];

    this.cardGeometry.dispose();
    this.padOutlineGeo.dispose();
    this.padPlaneGeo.dispose();
    this.hitPlaneGeo.dispose();
    this.sparkleTexture.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.container = null;
  }

  applySettings(settings: UserSettings): void {
    const prev = this.settings;
    this.settings = { ...settings };

    this.targetTiltDeg = getCameraTiltDeg(this.settings);

    if (prev.feltTheme !== this.settings.feltTheme) {
      this.applyFeltAppearance(this.settings.feltTheme);
      this.rebuildTableSlots();
      this.updateStockCounterBadge();
    }

    if (prev.cardBackTheme !== this.settings.cardBackTheme) {
      const backTex = this.cardTextures.getBackTexture(this.settings.cardBackTheme);
      this.sharedBackMat.map = backTex;
      this.sharedBackMat.needsUpdate = true;
    }

    const faceAppearanceChanged =
      prev.cardFaceTheme !== this.settings.cardFaceTheme ||
      prev.fourColorDeck !== this.settings.fourColorDeck;

    if (faceAppearanceChanged) {
      const facePalette = CARD_FACE_PALETTES[this.settings.cardFaceTheme];
      this.sharedEdgeMat.color.setHex(facePalette.edgeColor);
      this.sharedEdgeMat.needsUpdate = true;
      const frontRoughness = facePalette.isDark ? 0.74 : 0.5;

      for (const entity of this.cardEntities.values()) {
        entity.frontMat.map = this.cardTextures.getFaceTexture(
          entity.suit,
          entity.rank,
          this.settings.cardFaceTheme,
          this.settings.fourColorDeck,
        );
        entity.frontMat.roughness = frontRoughness;
        entity.frontMat.needsUpdate = true;
      }

      if (this.activeHint) {
        this.rebuildHintVisuals();
      }
      this.winCelebration.setAppearance(
        this.settings.cardFaceTheme,
        this.settings.cardBackTheme,
        this.settings.fourColorDeck,
      );
    }

    if (prev.leftHanded !== this.settings.leftHanded) {
      this.recomputeTargetsFromCurrentState(false);
      this.rebuildTableSlots();
      if (this.activeSelection) {
        this.rebuildSelectionVisuals();
      }
      if (this.activeHint) {
        this.rebuildHintVisuals();
      }
    } else if (prev.dimLockedCards !== this.settings.dimLockedCards) {
      this.recomputeLockedStates();
    }
  }

  syncState(
    state: GameState,
    lastAction?: MoveAction | 'deal-new' | 'undo' | 'restore',
    _prevAction?: MoveAction,
  ): void {
    this.pendingDropSnap = false;
    this.dragState = null;
    this.dragHoverPad.visible = false;

    const prevDeckCount = this.currentState?.config.decks;
    const prevSnapshots = new Map<
      number,
      { pos: THREE.Vector3; rotY: number; scale: number; faceUp: boolean; zone: CardLocation['zone'] }
    >();
    for (const [id, ent] of this.cardEntities) {
      prevSnapshots.set(id, {
        pos: ent.currentPos.clone(),
        rotY: ent.currentRot.y,
        scale: ent.currentScale,
        faceUp: ent.faceUp,
        zone: ent.location.zone,
      });
    }

    this.currentState = state;
    if (lastAction === 'deal-new' || lastAction === 'restore') {
      this.clearHint();
      this.showSelectionTargets(null);
      this.winCelebration.stop();
    } else if (lastAction && typeof lastAction === 'object') {
      this.clearHint();
      this.showSelectionTargets(null);
    }

    // Ensure card entities match cards in GameState
    this.reconcileCardEntities(state);

    // Prewarm textures for active suits
    const activeSuits: Suit[] =
      state.config.suits === 1
        ? ['spades']
        : state.config.suits === 2
          ? ['spades', 'hearts']
          : state.config.suits === 3
            ? ['spades', 'hearts', 'diamonds']
            : ['spades', 'hearts', 'diamonds', 'clubs'];
    this.cardTextures.prewarmTheme(
      this.settings.cardFaceTheme,
      this.settings.fourColorDeck,
      this.settings.cardBackTheme,
      activeSuits,
    );

    // Recompute layout & slot pads if deck count changed
    const width = this.container ? Math.max(1, this.container.clientWidth) : 1280;
    const height = this.container ? Math.max(1, this.container.clientHeight) : 720;
    const spec = getDeckLayoutSpec(state.config.decks);
    this.lastLayout = this.computeLayout(
      width,
      height,
      spec.columns,
      spec.foundationSlots,
      this.currentTiltDeg,
    );
    this.updateCameraTransform();

    if (prevDeckCount !== state.config.decks) {
      this.rebuildTableSlots();
    }
    this.updateStockCounterBadge();

    // Update target positions, scales, rotations, locked state
    const snapImmediate = lastAction === 'restore' || lastAction === undefined;
    this.recomputeTargetsFromCurrentState(snapImmediate);

    // Trigger expressive animations based on lastAction
    if (lastAction === 'deal-new') {
      this.scheduleNewGameDealAnimations(state);
    } else if (lastAction === 'undo') {
      this.scheduleUndoAnimations(state, prevSnapshots);
    } else if (lastAction && typeof lastAction === 'object') {
      if (lastAction.type === 'move') {
        this.scheduleMoveAnimations(state, lastAction, prevSnapshots);
      } else if (lastAction.type === 'deal') {
        this.scheduleStockDealAnimations(state, lastAction, prevSnapshots);
      }
    }

    this.winCelebration.updateBounds({
      minX: this.lastLayout.boardMinX,
      maxX: this.lastLayout.boardMaxX,
      minY: this.lastLayout.boardMinY,
      maxY: this.lastLayout.boardMaxY,
      cardScale: 1,
      foundationPositions: this.lastLayout.foundationPositions,
    });
  }

  showHint(hint: HintMove, hintIndex: number, totalHints: number): void {
    void hintIndex;
    void totalHints;
    this.activeHint = hint;
    this.hintElapsed = 0;
    this.rebuildHintVisuals();
  }

  clearHint(): void {
    this.activeHint = null;
    this.hintCurve = null;

    for (const child of [...this.hintGhostGroup.children]) {
      this.hintGhostGroup.remove(child);
    }
    for (const m of this.hintGhostMats) {
      m.dispose();
    }
    this.hintGhostMats = [];

    if (this.hintArcMesh) {
      this.hintGroup.remove(this.hintArcMesh);
      this.hintArcMesh.geometry.dispose();
      this.hintArcMesh = null;
    }
    if (this.hintArcMat) {
      this.hintArcMat.dispose();
      this.hintArcMat = null;
    }
    if (this.hintSourceOutline) {
      this.hintGroup.remove(this.hintSourceOutline);
      (this.hintSourceOutline.material as THREE.Material).dispose();
      this.hintSourceOutline = null;
    }
    if (this.hintDestOutline) {
      this.hintGroup.remove(this.hintDestOutline);
      (this.hintDestOutline.material as THREE.Material).dispose();
      this.hintDestOutline = null;
    }
    if (this.hintStockRing) {
      this.hintGroup.remove(this.hintStockRing);
      (this.hintStockRing.material as THREE.Material).dispose();
      this.hintStockRing = null;
    }
  }

  showSelectionTargets(selection: SelectionHighlight | null): void {
    const isNewSelection =
      selection !== null &&
      (this.activeSelection === null ||
        this.activeSelection.fromCol !== selection.fromCol ||
        this.activeSelection.fromIndex !== selection.fromIndex);

    this.activeSelection = selection;
    this.selectionElapsed = 0;

    for (const ent of this.cardEntities.values()) {
      ent.isSelected = false;
    }

    if (selection && this.currentState) {
      const col = this.currentState.columns[selection.fromCol];
      if (col) {
        for (let i = selection.fromIndex; i < col.length; i++) {
          const ent = this.cardEntities.get(col[i].id);
          if (ent) ent.isSelected = true;
        }
      }
      if (isNewSelection) {
        this.callbacks.onAnimationEvent?.('pickup');
      }
    }

    this.rebuildSelectionVisuals();
  }

  pulseLockedCard(col: number, index: number): void {
    if (!this.currentState) return;
    const card = this.currentState.columns[col]?.[index];
    if (!card) return;
    const ent = this.cardEntities.get(card.id);
    if (!ent) return;

    ent.pulseElapsed = 0;
    ent.pulseDuration = 0.36;
    this.callbacks.onAnimationEvent?.('blocked');
  }

  startWinCelebration(state: GameState): void {
    this.clearHint();
    this.showSelectionTargets(null);
    this.winCelebration.updateBounds({
      minX: this.lastLayout.boardMinX,
      maxX: this.lastLayout.boardMaxX,
      minY: this.lastLayout.boardMinY,
      maxY: this.lastLayout.boardMaxY,
      cardScale: 1,
      foundationPositions: this.lastLayout.foundationPositions,
    });
    this.winCelebration.start(
      state,
      this.settings.cardFaceTheme,
      this.settings.cardBackTheme,
      this.settings.fourColorDeck,
    );
  }

  stopWinCelebration(): void {
    this.winCelebration.stop();
  }

  resize(): void {
    if (!this.container || !this.renderer) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const decks = this.currentState?.config.decks ?? 2;
    const spec = getDeckLayoutSpec(decks);
    this.lastLayout = this.computeLayout(
      width,
      height,
      spec.columns,
      spec.foundationSlots,
      this.currentTiltDeg,
    );
    this.updateCameraTransform();
    this.rebuildTableSlots();
    this.recomputeTargetsFromCurrentState(false);

    // Keep any active/queued flights aimed at updated layout coordinates
    for (const [cardId, flight] of this.flights) {
      const ent = this.cardEntities.get(cardId);
      if (!ent) continue;
      if (flight.nextStage) {
        flight.nextStage.pos.copy(ent.targetPos);
        flight.nextStage.scale = ent.targetScale;
      } else {
        flight.endPos.copy(ent.targetPos);
        flight.endScale = ent.targetScale;
      }
    }

    if (this.activeSelection) {
      this.rebuildSelectionVisuals();
    }
    if (this.activeHint) {
      this.rebuildHintVisuals();
    }
    this.winCelebration.updateBounds({
      minX: this.lastLayout.boardMinX,
      maxX: this.lastLayout.boardMaxX,
      minY: this.lastLayout.boardMinY,
      maxY: this.lastLayout.boardMaxY,
      cardScale: 1,
      foundationPositions: this.lastLayout.foundationPositions,
    });
  }

  // ---------------------------------------------------------------------------
  // Layout & Camera Math
  // ---------------------------------------------------------------------------

  private computeLayout(
    viewportW: number,
    viewportH: number,
    numCols: number,
    numFoundations: number,
    tiltDeg: number,
  ): ComputedLayout {
    const colGap = numCols >= 16 ? 0.11 : numCols >= 12 ? 0.14 : 0.16;
    const colPitch = CARD_WIDTH + colGap;
    const colsSpan = (numCols - 1) * colPitch + CARD_WIDTH;
    const requiredWidth = colsSpan + 1.05;
    const minRequiredHeight = 9.0;

    const aspect = Math.max(0.45, viewportW / Math.max(1, viewportH));
    const fovRad = THREE.MathUtils.degToRad(CAMERA_FOV_DEG);
    const tanHalfFov = Math.tan(fovRad * 0.5);
    const theta = THREE.MathUtils.degToRad(Math.max(0, Math.min(28, tiltDeg)));
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const dVert = (minRequiredHeight * 0.5) * (cosT / tanHalfFov + sinT);
    const dHoriz =
      (requiredWidth * 0.5) / (tanHalfFov * aspect) +
      (minRequiredHeight * 0.5) * sinT;
    const camDist = Math.max(dVert, dHoriz) * 1.04;

    const yRelBottom = (-camDist * tanHalfFov) / (cosT + tanHalfFov * sinT);
    const yRelTop = (camDist * tanHalfFov) / (cosT - tanHalfFov * sinT);
    const visibleH = yRelTop - yRelBottom;

    // Leave clean headroom at top for sleek HUD bar without clipping Foundations
    const topHudReserve = Math.max(1.08, visibleH * 0.118);
    const bottomMargin = 0.3;

    const topRowY = yRelTop - topHudReserve - CARD_HEIGHT * 0.5;
    const tableauTopY = topRowY - CARD_HEIGHT * 0.5 - 0.52 - CARD_HEIGHT * 0.5;
    const tableauMinBottomY = yRelBottom + bottomMargin;

    const colCentersX: number[] = [];
    const halfColsSpan = ((numCols - 1) * colPitch) * 0.5;
    for (let c = 0; c < numCols; c++) {
      colCentersX.push(-halfColsSpan + c * colPitch);
    }

    const leftEdgeX = colCentersX[0] - CARD_WIDTH * 0.5;
    const rightEdgeX = colCentersX[numCols - 1] + CARD_WIDTH * 0.5;
    const boardWidth = rightEdgeX - leftEdgeX;

    // Stock & Foundations along top row
    const leftHanded = this.settings.leftHanded;
    const stockAnchorX = leftHanded
      ? colCentersX[0]
      : colCentersX[numCols - 1];
    const stockFanDir = leftHanded ? 1 : -1;

    const foundationPositions: THREE.Vector3[] = [];
    let foundationScale = 0.92;

    if (numCols === 10 && numFoundations === 8) {
      foundationScale = 0.92;
      for (let f = 0; f < 8; f++) {
        const colIdx = leftHanded ? f + 2 : f;
        foundationPositions.push(new THREE.Vector3(colCentersX[colIdx], topRowY, BASE_CARD_Z));
      }
    } else {
      const stockZoneReserve = 1.95;
      const availForFound = Math.max(4, boardWidth - stockZoneReserve - 0.45);
      foundationScale = Math.min(0.84, availForFound / (numFoundations * 1.12));
      const fSlotW = CARD_WIDTH * foundationScale;
      const fStep =
        numFoundations > 1
          ? (availForFound - fSlotW) / (numFoundations - 1)
          : 0;
      const fStartX = leftHanded
        ? rightEdgeX - fSlotW * 0.5
        : leftEdgeX + fSlotW * 0.5;
      const fDir = leftHanded ? -1 : 1;

      for (let f = 0; f < numFoundations; f++) {
        const fx = fStartX + fDir * f * fStep;
        foundationPositions.push(new THREE.Vector3(fx, topRowY, BASE_CARD_Z));
      }
    }

    return {
      numCols,
      numFoundations,
      colPitch,
      boardMinX: leftEdgeX,
      boardMaxX: rightEdgeX,
      boardMinY: yRelBottom,
      boardMaxY: yRelTop,
      topRowY,
      tableauTopY,
      tableauMinBottomY,
      foundationScale,
      stockAnchorX,
      stockFanDir,
      colCentersX,
      foundationPositions,
      camDist,
      camCenterY: 0,
    };
  }

  private updateCameraTransform(): void {
    const theta = THREE.MathUtils.degToRad(this.currentTiltDeg);
    const d = this.lastLayout.camDist;
    const cy = this.lastLayout.camCenterY;

    this.camera.position.set(0, cy - d * Math.sin(theta), d * Math.cos(theta));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, cy, 0);

    // Scale tabletop so studio radial vignette frames the current board cleanly
    const boardW = this.lastLayout.boardMaxX - this.lastLayout.boardMinX;
    const boardH = this.lastLayout.boardMaxY - this.lastLayout.boardMinY;
    this.tableMesh.scale.set(
      Math.max(26, boardW * 1.72),
      Math.max(20, boardH * 1.68),
      1,
    );

    // Keep directional shadow frustum tight to the current board
    const padX = Math.max(12, boardW * 0.68);
    const padY = Math.max(9, boardH * 0.68);
    this.keyLight.shadow.camera.left = -padX;
    this.keyLight.shadow.camera.right = padX;
    this.keyLight.shadow.camera.top = padY;
    this.keyLight.shadow.camera.bottom = -padY;
    this.keyLight.shadow.camera.updateProjectionMatrix();
  }

  private getColumnCardOffsets(cards: readonly Card[]): {
    yPositions: number[];
    faceDownStep: number;
    faceUpStep: number;
  } {
    const n = cards.length;
    if (n === 0) {
      return { yPositions: [], faceDownStep: 0.19, faceUpStep: 0.42 };
    }

    let downCount = 0;
    let upCount = 0;
    for (let i = 0; i < n - 1; i++) {
      if (cards[i].faceUp) upCount++;
      else downCount++;
    }

    let downStep = 0.19;
    let upStep = 0.42;
    const maxCenterDrop = Math.max(
      1.2,
      this.lastLayout.tableauTopY -
        (this.lastLayout.tableauMinBottomY + CARD_HEIGHT * 0.5),
    );

    let totalDrop = downCount * downStep + upCount * upStep;
    if (totalDrop > maxCenterDrop) {
      if (downCount > 0) {
        const minDown = 0.085;
        const needed = totalDrop - maxCenterDrop;
        const maxSaveDown = downCount * (downStep - minDown);
        if (needed <= maxSaveDown) {
          downStep -= needed / downCount;
        } else {
          downStep = minDown;
        }
      }
      totalDrop = downCount * downStep + upCount * upStep;
      if (totalDrop > maxCenterDrop && upCount > 0) {
        const availForUp = Math.max(0.2, maxCenterDrop - downCount * downStep);
        upStep = availForUp / upCount;
        if (downCount * downStep + upCount * upStep > maxCenterDrop) {
          const factor = maxCenterDrop / (downCount * downStep + upCount * upStep);
          downStep *= factor;
          upStep *= factor;
        }
      }
    }

    const yPositions: number[] = [];
    let y = this.lastLayout.tableauTopY;
    for (let i = 0; i < n; i++) {
      yPositions.push(y);
      y -= cards[i].faceUp ? upStep : downStep;
    }

    return { yPositions, faceDownStep: downStep, faceUpStep: upStep };
  }

  private getColumnDropTarget(col: number): THREE.Vector3 {
    const x = this.lastLayout.colCentersX[col] ?? 0;
    const cards = this.currentState?.columns[col] ?? [];
    if (cards.length === 0) {
      return new THREE.Vector3(x, this.lastLayout.tableauTopY, BASE_CARD_Z);
    }
    const { yPositions, faceDownStep, faceUpStep } = this.getColumnCardOffsets(cards);
    const lastCard = cards[cards.length - 1];
    const step = lastCard.faceUp ? faceUpStep : faceDownStep;
    const dropY = Math.max(
      this.lastLayout.tableauMinBottomY + CARD_HEIGHT * 0.5,
      yPositions[cards.length - 1] - step,
    );
    return new THREE.Vector3(x, dropY, BASE_CARD_Z + cards.length * CARD_Z_STEP);
  }

  private getStockWavePosition(batchIdx: number, totalBatches: number, cardOffset: number): THREE.Vector3 {
    const fanSpacing = Math.min(0.16, 0.96 / Math.max(1, totalBatches));
    const x =
      this.lastLayout.stockAnchorX +
      this.lastLayout.stockFanDir * batchIdx * fanSpacing;
    const y = this.lastLayout.topRowY;
    const z = BASE_CARD_Z + batchIdx * 0.044 + cardOffset * 0.0024;
    return new THREE.Vector3(x, y, z);
  }

  // ---------------------------------------------------------------------------
  // Tabletop & Slot Visuals
  // ---------------------------------------------------------------------------

  private applyFeltAppearance(theme: FeltTheme): void {
    const palette = FELT_PALETTES[theme];
    this.scene.background = new THREE.Color(palette.backgroundHex);

    this.ambientLight.color.setHex(palette.ambientColor);
    this.ambientLight.intensity = palette.ambientIntensity;
    this.keyLight.color.setHex(palette.keyLightColor);
    this.keyLight.intensity = palette.keyLightIntensity;
    this.fillLight.color.setHex(palette.fillLightColor);
    this.fillLight.intensity = palette.fillLightIntensity;
    this.rimLight.color.setHex(palette.rimLightColor);

    this.tableTextures?.dispose();
    const maxAniso = this.renderer?.capabilities.getMaxAnisotropy() ?? 8;
    this.tableTextures = createTableTextures(theme, maxAniso);

    this.tableMat.map = this.tableTextures.map;
    this.tableMat.bumpMap = this.tableTextures.bumpMap;
    this.tableMat.bumpScale = palette.bumpScale;
    this.tableMat.roughness = palette.roughness;
    this.tableMat.metalness = palette.metalness;
    this.tableMat.needsUpdate = true;
  }

  private clearSlotMeshes(): void {
    for (const child of [...this.slotGroup.children]) {
      this.slotGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.Material).dispose();
      }
    }
    for (const tex of this.slotTextures) {
      tex.dispose();
    }
    this.slotTextures = [];
    this.tableauPadMeshes = [];
    this.foundationPadMeshes = [];
    this.stockPadMesh = null;
    this.stockCounterMesh = null;
  }

  private rebuildTableSlots(): void {
    this.clearSlotMeshes();
    const maxAniso = this.renderer?.capabilities.getMaxAnisotropy() ?? 8;
    const theme = this.settings.feltTheme;

    const tabTex = createSlotDecalTexture('tableau', theme, maxAniso);
    const foundTex = createSlotDecalTexture('foundation', theme, maxAniso);
    const stockTex = createSlotDecalTexture('stock', theme, maxAniso);
    this.slotTextures.push(tabTex, foundTex, stockTex);

    // Tableau empty column pads
    for (let c = 0; c < this.lastLayout.numCols; c++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tabTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.padPlaneGeo, mat);
      mesh.position.set(
        this.lastLayout.colCentersX[c],
        this.lastLayout.tableauTopY,
        0.004,
      );
      this.slotGroup.add(mesh);
      this.tableauPadMeshes.push(mesh);
    }

    // Foundation pads
    for (let f = 0; f < this.lastLayout.foundationPositions.length; f++) {
      const fp = this.lastLayout.foundationPositions[f];
      const mat = new THREE.MeshBasicMaterial({
        map: foundTex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.padPlaneGeo, mat);
      mesh.position.set(fp.x, fp.y, 0.004);
      mesh.scale.setScalar(this.lastLayout.foundationScale);
      this.slotGroup.add(mesh);
      this.foundationPadMeshes.push(mesh);
    }

    // Stock base pad
    const stockMat = new THREE.MeshBasicMaterial({
      map: stockTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const stockMesh = new THREE.Mesh(this.padPlaneGeo, stockMat);
    stockMesh.position.set(
      this.lastLayout.stockAnchorX,
      this.lastLayout.topRowY,
      0.004,
    );
    this.slotGroup.add(stockMesh);
    this.stockPadMesh = stockMesh;

    // Stock counter badge
    const badgeGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const badgeMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
    });
    const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
    const badgeOffsetX = this.settings.leftHanded ? -0.42 : 0.42;
    badgeMesh.position.set(
      this.lastLayout.stockAnchorX + badgeOffsetX,
      this.lastLayout.topRowY - CARD_HEIGHT * 0.44,
      0.24,
    );
    this.slotGroup.add(badgeMesh);
    this.stockCounterMesh = badgeMesh;
    this.updateStockCounterBadge();
  }

  private updateStockCounterBadge(): void {
    if (!this.stockCounterMesh) return;
    const count = this.currentState?.stock.length ?? 0;
    this.stockCounterTex?.dispose();
    this.stockCounterTex = createStockCounterTexture(count, this.settings.feltTheme);
    const mat = this.stockCounterMesh.material as THREE.MeshBasicMaterial;
    mat.map = this.stockCounterTex;
    mat.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Card Entity Reconciliation & Locked Computation
  // ---------------------------------------------------------------------------

  private reconcileCardEntities(state: GameState): void {
    const aliveIds = new Set<number>();

    const ensureEntity = (card: Card, location: CardLocation): CardEntity => {
      aliveIds.add(card.id);
      let ent = this.cardEntities.get(card.id);
      if (!ent) {
        const faceTex = this.cardTextures.getFaceTexture(
          card.suit,
          card.rank,
          this.settings.cardFaceTheme,
          this.settings.fourColorDeck,
        );
        const frontRoughness = CARD_FACE_PALETTES[this.settings.cardFaceTheme].isDark
          ? 0.74
          : 0.5;
        const frontMat = new THREE.MeshStandardMaterial({
          map: faceTex,
          color: 0xffffff,
          roughness: frontRoughness,
          metalness: 0.01,
        });
        const mesh = new THREE.Mesh(this.cardGeometry, [
          frontMat,
          this.sharedBackMat,
          this.sharedEdgeMat,
        ]);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.userData = { cardId: card.id };
        this.cardsGroup.add(mesh);

        const initRotY = card.faceUp ? 0 : Math.PI;
        ent = {
          id: card.id,
          suit: card.suit,
          rank: card.rank,
          faceUp: card.faceUp,
          mesh,
          frontMat,
          currentPos: new THREE.Vector3(
            this.lastLayout.stockAnchorX,
            this.lastLayout.topRowY,
            BASE_CARD_Z,
          ),
          targetPos: new THREE.Vector3(),
          currentRot: new THREE.Euler(0, initRotY, 0),
          targetRot: new THREE.Euler(0, initRotY, 0),
          currentScale: 1,
          targetScale: 1,
          isLocked: false,
          dimBlend: 0,
          isSelected: false,
          pulseElapsed: 0,
          pulseDuration: 0,
          location,
        };
        mesh.position.copy(ent.currentPos);
        mesh.rotation.copy(ent.currentRot);
        this.cardEntities.set(card.id, ent);
      } else {
        ent.faceUp = card.faceUp;
        ent.location = location;
        if (ent.suit !== card.suit || ent.rank !== card.rank) {
          ent.suit = card.suit;
          ent.rank = card.rank;
          ent.frontMat.map = this.cardTextures.getFaceTexture(
            card.suit,
            card.rank,
            this.settings.cardFaceTheme,
            this.settings.fourColorDeck,
          );
          ent.frontMat.needsUpdate = true;
        }
      }
      return ent;
    };

    for (let c = 0; c < state.columns.length; c++) {
      const col = state.columns[c];
      for (let i = 0; i < col.length; i++) {
        ensureEntity(col[i], { zone: 'tableau', col: c, index: i });
      }
    }

    for (let b = 0; b < state.stock.length; b++) {
      const batch = state.stock[b];
      for (let i = 0; i < batch.length; i++) {
        ensureEntity(batch[i], { zone: 'stock', batch: b, cardOffset: i });
      }
    }

    for (let f = 0; f < state.foundations.length; f++) {
      const pile = state.foundations[f];
      for (let i = 0; i < pile.cards.length; i++) {
        ensureEntity(pile.cards[i], {
          zone: 'foundation',
          foundationIndex: f,
          cardOffset: i,
        });
      }
    }

    // Remove entities no longer in GameState
    for (const [id, ent] of this.cardEntities) {
      if (!aliveIds.has(id)) {
        this.cardsGroup.remove(ent.mesh);
        ent.frontMat.dispose();
        this.cardEntities.delete(id);
        this.flights.delete(id);
      }
    }
  }

  private getMovableStartIndex(colCards: readonly Card[]): number {
    if (colCards.length === 0) return 0;
    let idx = colCards.length - 1;
    if (!colCards[idx].faceUp) return colCards.length;
    while (idx > 0) {
      const curr = colCards[idx];
      const above = colCards[idx - 1];
      if (
        above.faceUp &&
        above.suit === curr.suit &&
        above.rank === curr.rank + 1
      ) {
        idx--;
      } else {
        break;
      }
    }
    return idx;
  }

  private recomputeLockedStates(): void {
    if (!this.currentState) return;
    for (let c = 0; c < this.currentState.columns.length; c++) {
      const col = this.currentState.columns[c];
      const movableStart = this.getMovableStartIndex(col);
      for (let i = 0; i < col.length; i++) {
        const ent = this.cardEntities.get(col[i].id);
        if (!ent) continue;
        ent.isLocked = col[i].faceUp && i < movableStart;
      }
    }
    for (const pile of this.currentState.foundations) {
      for (const card of pile.cards) {
        const ent = this.cardEntities.get(card.id);
        if (ent) ent.isLocked = false;
      }
    }
    for (const batch of this.currentState.stock) {
      for (const card of batch) {
        const ent = this.cardEntities.get(card.id);
        if (ent) ent.isLocked = false;
      }
    }
  }

  private recomputeTargetsFromCurrentState(snapImmediate: boolean): void {
    if (!this.currentState) return;
    const state = this.currentState;
    this.recomputeLockedStates();

    // Tableau columns
    for (let c = 0; c < state.columns.length; c++) {
      const col = state.columns[c];
      const x = this.lastLayout.colCentersX[c] ?? 0;
      const { yPositions } = this.getColumnCardOffsets(col);

      for (let i = 0; i < col.length; i++) {
        const card = col[i];
        const ent = this.cardEntities.get(card.id);
        if (!ent) continue;

        ent.mesh.castShadow = true;
        const y = yPositions[i];
        const z = BASE_CARD_Z + i * CARD_Z_STEP;
        ent.targetPos.set(x, y, z);
        ent.targetRot.set(0, card.faceUp ? 0 : Math.PI, 0);
        ent.targetScale = 1;

        if (snapImmediate) {
          this.flights.delete(ent.id);
          ent.currentPos.copy(ent.targetPos);
          ent.currentRot.copy(ent.targetRot);
          ent.currentScale = ent.targetScale;
          ent.mesh.position.copy(ent.currentPos);
          ent.mesh.rotation.copy(ent.currentRot);
          ent.mesh.scale.setScalar(ent.currentScale);
        }
      }
    }

    // Stock piles
    const totalBatches = state.stock.length;
    for (let b = 0; b < totalBatches; b++) {
      const batch = state.stock[b];
      for (let i = 0; i < batch.length; i++) {
        const card = batch[i];
        const ent = this.cardEntities.get(card.id);
        if (!ent) continue;

        ent.mesh.castShadow = i === 0 && (b === totalBatches - 1 || b === 0);
        const pos = this.getStockWavePosition(b, totalBatches, i);
        ent.targetPos.copy(pos);
        ent.targetRot.set(0, Math.PI, 0);
        ent.targetScale = 1;

        if (snapImmediate) {
          this.flights.delete(ent.id);
          ent.currentPos.copy(ent.targetPos);
          ent.currentRot.copy(ent.targetRot);
          ent.currentScale = ent.targetScale;
          ent.mesh.position.copy(ent.currentPos);
          ent.mesh.rotation.copy(ent.currentRot);
          ent.mesh.scale.setScalar(ent.currentScale);
        }
      }
    }

    // Foundations
    for (let f = 0; f < state.foundations.length; f++) {
      const pile = state.foundations[f];
      const fp =
        this.lastLayout.foundationPositions[f] ??
        new THREE.Vector3(0, this.lastLayout.topRowY, BASE_CARD_Z);
      for (let i = 0; i < pile.cards.length; i++) {
        const card = pile.cards[i];
        const ent = this.cardEntities.get(card.id);
        if (!ent) continue;

        ent.mesh.castShadow = i === pile.cards.length - 1;
        // Layer Ace at bottom, King on top so King shows face-up
        const rankOrder = card.rank - 1;
        ent.targetPos.set(fp.x, fp.y, BASE_CARD_Z + rankOrder * 0.016);
        ent.targetRot.set(0, 0, 0);
        ent.targetScale = this.lastLayout.foundationScale;

        if (snapImmediate) {
          this.flights.delete(ent.id);
          ent.currentPos.copy(ent.targetPos);
          ent.currentRot.copy(ent.targetRot);
          ent.currentScale = ent.targetScale;
          ent.mesh.position.copy(ent.currentPos);
          ent.mesh.rotation.copy(ent.currentRot);
          ent.mesh.scale.setScalar(ent.currentScale);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Parabolic Deal, Move, Flip, Suit Completion, and Undo Animations
  // ---------------------------------------------------------------------------

  private scheduleNewGameDealAnimations(state: GameState): void {
    this.flights.clear();

    const stockOrigin = this.getStockWavePosition(
      Math.max(0, state.stock.length - 1),
      Math.max(1, state.stock.length),
      0,
    );

    const maxLen = state.columns.reduce((m, col) => Math.max(m, col.length), 0);
    let dealOrder = 0;
    let lastFaceUpOrder = 0;

    // Count total cards to find final face-up card
    for (let r = 0; r < maxLen; r++) {
      for (let c = 0; c < state.columns.length; c++) {
        const card = state.columns[c][r];
        if (card && card.faceUp) {
          lastFaceUpOrder = dealOrder;
        }
        if (card) dealOrder++;
      }
    }

    const totalDealt = state.columns.reduce((sum, col) => sum + col.length, 0);
    const dealStagger = Math.min(0.017, 0.72 / Math.max(1, totalDealt));

    dealOrder = 0;
    for (let r = 0; r < maxLen; r++) {
      for (let c = 0; c < state.columns.length; c++) {
        const card = state.columns[c][r];
        if (!card) continue;
        const ent = this.cardEntities.get(card.id);
        if (!ent) continue;

        ent.currentPos.copy(stockOrigin);
        ent.currentPos.z += (totalDealt - dealOrder) * 0.002;
        ent.currentRot.set(0, Math.PI, 0);
        ent.mesh.position.copy(ent.currentPos);
        ent.mesh.rotation.copy(ent.currentRot);

        const isLastFlip = dealOrder === lastFaceUpOrder;
        const soundAtStart: SceneSoundEvent | undefined =
          dealOrder % 3 === 0 ? 'deal' : undefined;

        this.flights.set(card.id, {
          cardId: card.id,
          delay: dealOrder * dealStagger,
          elapsed: 0,
          duration: 0.28,
          startPos: ent.currentPos.clone(),
          endPos: ent.targetPos.clone(),
          startRot: new THREE.Euler(0, Math.PI, 0),
          endRot: ent.targetRot.clone(),
          startScale: 1,
          endScale: 1,
          peakZ: 0.78,
          bankRoll: (c - state.columns.length * 0.5) * 0.025,
          flipDelayFrac: card.faceUp ? 0.36 : 1,
          soundAtStart,
          soundAtLand: isLastFlip ? 'flip' : undefined,
          started: false,
          finished: false,
        });
        dealOrder++;
      }
    }
  }

  private scheduleMoveAnimations(
    state: GameState,
    action: Extract<MoveAction, { type: 'move' }>,
    prevSnapshots: Map<
      number,
      { pos: THREE.Vector3; rotY: number; scale: number; faceUp: boolean; zone: CardLocation['zone'] }
    >,
  ): void {
    const movedSet = new Set(action.cardIds);
    const completed = action.completedSuit;
    const completedSet = new Set(completed?.cardIds ?? []);

    // If a move completed a suit, compute the temporary landing slot on toCol
    let toColBaseLandingY = this.lastLayout.tableauTopY;
    let toColBaseCount = state.columns[action.toCol]?.length ?? 0;
    if (completed && completed.fromCol === action.toCol) {
      const remCol = state.columns[action.toCol] ?? [];
      if (remCol.length > 0) {
        const { yPositions, faceUpStep } = this.getColumnCardOffsets(remCol);
        toColBaseLandingY = yPositions[remCol.length - 1] - faceUpStep;
      } else {
        toColBaseLandingY = this.lastLayout.tableauTopY;
      }
      toColBaseCount = remCol.length;
    }

    // 1. Animate moved cards
    for (let i = 0; i < action.cardIds.length; i++) {
      const cardId = action.cardIds[i];
      const ent = this.cardEntities.get(cardId);
      if (!ent) continue;

      const prev = prevSnapshots.get(cardId);
      const startPos = prev ? prev.pos.clone() : ent.currentPos.clone();
      const startRot = prev
        ? new THREE.Euler(0, prev.rotY, 0)
        : ent.currentRot.clone();
      const wasCloseFromDrag = startPos.distanceTo(ent.targetPos) < 1.3;

      if (completedSet.has(cardId) && completed) {
        // Two-stage: first settle onto toCol briefly, then peel in A->K cascade
        const rankOffsetFromTop = completed.cardIds.length - ent.rank;
        const waypointPos = new THREE.Vector3(
          this.lastLayout.colCentersX[action.toCol] ?? 0,
          toColBaseLandingY - rankOffsetFromTop * 0.34,
          BASE_CARD_Z + (toColBaseCount + rankOffsetFromTop) * CARD_Z_STEP,
        );
        const aceToKingIdx = ent.rank - 1;
        this.flights.set(cardId, {
          cardId,
          delay: i * 0.015,
          elapsed: 0,
          duration: 0.16,
          startPos,
          endPos: waypointPos,
          startRot,
          endRot: new THREE.Euler(0, 0, 0),
          startScale: 1,
          endScale: 1,
          peakZ: wasCloseFromDrag ? 0.18 : 0.48,
          bankRoll: 0.04,
          flipDelayFrac: 0,
          soundAtLand: i === action.cardIds.length - 1 ? 'place' : undefined,
          nextStage: {
            pos: ent.targetPos.clone(),
            rotY: 0,
            scale: ent.targetScale,
            duration: 0.44 + aceToKingIdx * 0.015,
            peakZ: 1.55 + aceToKingIdx * 0.055,
          },
          started: false,
          finished: false,
        });
      } else {
        this.flights.set(cardId, {
          cardId,
          delay: i * 0.018,
          elapsed: 0,
          duration: wasCloseFromDrag ? 0.17 : 0.28,
          startPos,
          endPos: ent.targetPos.clone(),
          startRot,
          endRot: ent.targetRot.clone(),
          startScale: prev?.scale ?? 1,
          endScale: ent.targetScale,
          peakZ: wasCloseFromDrag ? 0.14 : 0.56,
          bankRoll: (action.toCol - action.fromCol) * 0.025,
          flipDelayFrac: 0,
          soundAtLand: i === 0 ? 'place' : undefined,
          started: false,
          finished: false,
        });
      }
    }

    // 2. Exposed card flip on fromCol
    if (action.flippedCardId !== null) {
      const flipEnt = this.cardEntities.get(action.flippedCardId);
      const prev = prevSnapshots.get(action.flippedCardId);
      if (flipEnt && !movedSet.has(action.flippedCardId)) {
        const startY = prev ? prev.rotY : Math.PI;
        this.flights.set(flipEnt.id, {
          cardId: flipEnt.id,
          delay: 0.09,
          elapsed: 0,
          duration: 0.28,
          startPos: prev ? prev.pos.clone() : flipEnt.currentPos.clone(),
          endPos: flipEnt.targetPos.clone(),
          startRot: new THREE.Euler(0, startY, 0),
          endRot: new THREE.Euler(0, 0, 0),
          startScale: 1,
          endScale: 1,
          peakZ: 0.48,
          bankRoll: 0.08,
          flipDelayFrac: 0.1,
          soundAtStart: 'flip',
          started: false,
          finished: false,
        });
      }
    }

    // 3. Remaining cards in completedSuit (already sitting in toCol before move)
    if (completed) {
      for (const cid of completed.cardIds) {
        if (movedSet.has(cid)) continue;
        const ent = this.cardEntities.get(cid);
        if (!ent) continue;
        const prev = prevSnapshots.get(cid);
        const aceToKingIdx = ent.rank - 1;
        this.flights.set(cid, {
          cardId: cid,
          delay: 0.18 + aceToKingIdx * 0.038,
          elapsed: 0,
          duration: 0.44 + aceToKingIdx * 0.014,
          startPos: prev ? prev.pos.clone() : ent.currentPos.clone(),
          endPos: ent.targetPos.clone(),
          startRot: new THREE.Euler(0, 0, 0),
          endRot: new THREE.Euler(0, 0, 0),
          startScale: 1,
          endScale: ent.targetScale,
          peakZ: 1.55 + aceToKingIdx * 0.055,
          bankRoll: (completed.foundationIndex - completed.fromCol) * 0.03,
          flipDelayFrac: 0,
          soundAtStart: aceToKingIdx === 0 ? 'complete-suit' : undefined,
          sparkleOnLand: aceToKingIdx % 3 === 0 || aceToKingIdx === 12,
          started: false,
          finished: false,
        });
      }

      if (completed.flippedAfterCompleteId !== null) {
        const fcEnt = this.cardEntities.get(completed.flippedAfterCompleteId);
        const prev = prevSnapshots.get(completed.flippedAfterCompleteId);
        if (fcEnt) {
          this.flights.set(fcEnt.id, {
            cardId: fcEnt.id,
            delay: 0.56,
            elapsed: 0,
            duration: 0.28,
            startPos: prev ? prev.pos.clone() : fcEnt.currentPos.clone(),
            endPos: fcEnt.targetPos.clone(),
            startRot: new THREE.Euler(0, prev?.rotY ?? Math.PI, 0),
            endRot: new THREE.Euler(0, 0, 0),
            startScale: 1,
            endScale: 1,
            peakZ: 0.48,
            bankRoll: 0.08,
            flipDelayFrac: 0.1,
            soundAtStart: 'flip',
            started: false,
            finished: false,
          });
        }
      }
    }
  }

  private scheduleStockDealAnimations(
    state: GameState,
    action: Extract<MoveAction, { type: 'deal' }>,
    prevSnapshots: Map<
      number,
      { pos: THREE.Vector3; rotY: number; scale: number; faceUp: boolean; zone: CardLocation['zone'] }
    >,
  ): void {
    const completedCardToRecord = new Map<
      number,
      Extract<MoveAction, { type: 'deal' }>['completedSuits'][number]
    >();
    for (const cs of action.completedSuits) {
      for (const cid of cs.cardIds) {
        completedCardToRecord.set(cid, cs);
      }
    }

    for (let i = 0; i < action.dealtCardIds.length; i++) {
      const cardId = action.dealtCardIds[i];
      const ent = this.cardEntities.get(cardId);
      if (!ent) continue;

      const prev = prevSnapshots.get(cardId);
      const startPos = prev ? prev.pos.clone() : ent.currentPos.clone();
      const cs = completedCardToRecord.get(cardId);

      if (cs) {
        const colTarget = this.getColumnDropTarget(cs.fromCol);
        const aceToKingIdx = ent.rank - 1;
        this.flights.set(cardId, {
          cardId,
          delay: i * 0.048,
          elapsed: 0,
          duration: 0.3,
          startPos,
          endPos: colTarget,
          startRot: new THREE.Euler(0, Math.PI, 0),
          endRot: new THREE.Euler(0, 0, 0),
          startScale: 1,
          endScale: 1,
          peakZ: 1.0,
          bankRoll: 0.06,
          flipDelayFrac: 0.35,
          soundAtStart: 'deal',
          nextStage: {
            pos: ent.targetPos.clone(),
            rotY: 0,
            scale: ent.targetScale,
            duration: 0.44 + aceToKingIdx * 0.014,
            peakZ: 1.55 + aceToKingIdx * 0.055,
          },
          started: false,
          finished: false,
        });
      } else {
        this.flights.set(cardId, {
          cardId,
          delay: i * 0.048,
          elapsed: 0,
          duration: 0.32,
          startPos,
          endPos: ent.targetPos.clone(),
          startRot: new THREE.Euler(0, prev?.rotY ?? Math.PI, 0),
          endRot: ent.targetRot.clone(),
          startScale: 1,
          endScale: ent.targetScale,
          peakZ: 0.98,
          bankRoll: (i - state.columns.length * 0.5) * 0.025,
          flipDelayFrac: 0.35,
          soundAtStart: 'deal',
          started: false,
          finished: false,
        });
      }
    }

    // Completed suits triggered by deal
    const dealDelayBase = action.dealtCardIds.length * 0.048 + 0.32;
    const dealtSet = new Set(action.dealtCardIds);
    for (let sIdx = 0; sIdx < action.completedSuits.length; sIdx++) {
      const cs = action.completedSuits[sIdx];
      for (const cid of cs.cardIds) {
        if (dealtSet.has(cid)) continue;
        const ent = this.cardEntities.get(cid);
        if (!ent) continue;
        const prev = prevSnapshots.get(cid);
        const aceToKingIdx = ent.rank - 1;
        this.flights.set(cid, {
          cardId: cid,
          delay: dealDelayBase + sIdx * 0.16 + aceToKingIdx * 0.036,
          elapsed: 0,
          duration: 0.44 + aceToKingIdx * 0.014,
          startPos: prev ? prev.pos.clone() : ent.currentPos.clone(),
          endPos: ent.targetPos.clone(),
          startRot: new THREE.Euler(0, 0, 0),
          endRot: new THREE.Euler(0, 0, 0),
          startScale: 1,
          endScale: ent.targetScale,
          peakZ: 1.55 + aceToKingIdx * 0.055,
          bankRoll: 0.05,
          flipDelayFrac: 0,
          soundAtStart: aceToKingIdx === 0 ? 'complete-suit' : undefined,
          sparkleOnLand: aceToKingIdx % 3 === 0 || aceToKingIdx === 12,
          started: false,
          finished: false,
        });
      }

      if (cs.flippedAfterCompleteId !== null) {
        const fcEnt = this.cardEntities.get(cs.flippedAfterCompleteId);
        const prev = prevSnapshots.get(cs.flippedAfterCompleteId);
        if (fcEnt) {
          this.flights.set(fcEnt.id, {
            cardId: fcEnt.id,
            delay: dealDelayBase + sIdx * 0.16 + 0.35,
            elapsed: 0,
            duration: 0.28,
            startPos: prev ? prev.pos.clone() : fcEnt.currentPos.clone(),
            endPos: fcEnt.targetPos.clone(),
            startRot: new THREE.Euler(0, prev?.rotY ?? Math.PI, 0),
            endRot: new THREE.Euler(0, 0, 0),
            startScale: 1,
            endScale: 1,
            peakZ: 0.46,
            bankRoll: 0.07,
            flipDelayFrac: 0.1,
            soundAtStart: 'flip',
            started: false,
            finished: false,
          });
        }
      }
    }
  }

  private scheduleUndoAnimations(
    _state: GameState,
    prevSnapshots: Map<
      number,
      { pos: THREE.Vector3; rotY: number; scale: number; faceUp: boolean; zone: CardLocation['zone'] }
    >,
  ): void {
    let anyMoved = false;
    let idx = 0;

    for (const [id, ent] of this.cardEntities) {
      const prev = prevSnapshots.get(id);
      if (!prev) continue;

      const dist = prev.pos.distanceTo(ent.targetPos);
      const rotDiff = Math.abs(prev.rotY - ent.targetRot.y);
      if (dist > 0.08 || rotDiff > 0.2) {
        anyMoved = true;
        this.flights.set(id, {
          cardId: id,
          delay: Math.min(idx * 0.012, 0.18),
          elapsed: 0,
          duration: 0.26,
          startPos: prev.pos.clone(),
          endPos: ent.targetPos.clone(),
          startRot: new THREE.Euler(0, prev.rotY, 0),
          endRot: ent.targetRot.clone(),
          startScale: prev.scale,
          endScale: ent.targetScale,
          peakZ: dist > 0.35 ? 0.65 : 0.36,
          bankRoll: 0.05,
          flipDelayFrac: rotDiff > 0.2 ? 0.2 : 0,
          started: false,
          finished: false,
        });
        idx++;
      }
    }

    if (anyMoved) {
      this.callbacks.onAnimationEvent?.('undo');
    }
  }

  // ---------------------------------------------------------------------------
  // Hint Ghost Arc & Stock Pulse
  // ---------------------------------------------------------------------------

  private rebuildHintVisuals(): void {
    const hint = this.activeHint;
    this.clearHint();
    this.activeHint = hint;
    if (!hint || !this.currentState) return;

    if (hint.kind === 'deal') {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      this.hintStockRing = new THREE.Mesh(this.padOutlineGeo, ringMat);
      const stockTop = this.getStockWavePosition(
        Math.max(0, this.currentState.stock.length - 1),
        Math.max(1, this.currentState.stock.length),
        0,
      );
      this.hintStockRing.position.set(stockTop.x, stockTop.y, stockTop.z + 0.04);
      this.hintGroup.add(this.hintStockRing);

      // Floating ghost card lifting off stock
      const backTex = this.cardTextures.getBackTexture(this.settings.cardBackTheme);
      const ghostMat = new THREE.MeshBasicMaterial({
        map: backTex,
        color: 0xfff3b0,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      this.hintGhostMats.push(ghostMat);
      const ghostCard = new THREE.Mesh(this.padPlaneGeo, ghostMat);
      this.hintGhostGroup.add(ghostCard);
      this.hintGhostGroup.position.copy(stockTop);
      return;
    }

    // hint.kind === 'move'
    const srcCol = this.currentState.columns[hint.fromCol] ?? [];
    const { yPositions, faceUpStep } = this.getColumnCardOffsets(srcCol);
    const srcX = this.lastLayout.colCentersX[hint.fromCol] ?? 0;
    const srcY = yPositions[hint.fromIndex] ?? this.lastLayout.tableauTopY;
    const srcZ = BASE_CARD_Z + hint.fromIndex * CARD_Z_STEP + 0.08;

    const destPos = this.getColumnDropTarget(hint.toCol);
    this.hintDestPos.copy(destPos);

    // Source rim outline
    const srcMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.hintSourceOutline = new THREE.Mesh(this.padOutlineGeo, srcMat);
    const runLen = Math.max(1, srcCol.length - hint.fromIndex);
    const runH = CARD_HEIGHT + (runLen - 1) * faceUpStep;
    this.hintSourceOutline.scale.set(1.03, runH / CARD_HEIGHT, 1);
    this.hintSourceOutline.position.set(
      srcX,
      srcY - ((runLen - 1) * faceUpStep) * 0.5,
      srcZ,
    );
    this.hintGroup.add(this.hintSourceOutline);

    // Destination pad outline
    const destMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.hintDestOutline = new THREE.Mesh(this.padOutlineGeo, destMat);
    this.hintDestOutline.position.set(destPos.x, destPos.y, destPos.z + 0.03);
    this.hintGroup.add(this.hintDestOutline);

    // Ghost card run meshes
    const stepY = Math.min(0.4, faceUpStep);
    for (let i = 0; i < hint.cardIds.length; i++) {
      const card = srcCol[hint.fromIndex + i];
      if (!card) continue;
      const tex = this.cardTextures.getFaceTexture(
        card.suit,
        card.rank,
        this.settings.cardFaceTheme,
        this.settings.fourColorDeck,
      );
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xfff6d6,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      this.hintGhostMats.push(mat);
      const mesh = new THREE.Mesh(this.padPlaneGeo, mat);
      mesh.position.set(0, -i * stepY, i * 0.015);
      this.hintGhostGroup.add(mesh);
    }

    // 3D Cubic Bezier flight arc
    const startPt = new THREE.Vector3(srcX, srcY, srcZ + 0.14);
    const endPt = new THREE.Vector3(destPos.x, destPos.y, destPos.z + 0.18);
    const midX = (startPt.x + endPt.x) * 0.5;
    const midY = Math.max(startPt.y, endPt.y) + 0.55;
    const peakZ = 1.25 + Math.min(0.8, startPt.distanceTo(endPt) * 0.08);

    this.hintCurve = new THREE.CubicBezierCurve3(
      startPt,
      new THREE.Vector3(THREE.MathUtils.lerp(startPt.x, midX, 0.55), midY, peakZ),
      new THREE.Vector3(THREE.MathUtils.lerp(endPt.x, midX, 0.55), midY, peakZ),
      endPt,
    );

    const tubeGeo = new THREE.TubeGeometry(this.hintCurve, 32, 0.036, 8, false);
    this.hintArcMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.hintArcMesh = new THREE.Mesh(tubeGeo, this.hintArcMat);
    this.hintGroup.add(this.hintArcMesh);
  }

  // ---------------------------------------------------------------------------
  // Click-Card Multi-Destination Targets & Animated Streamers
  // ---------------------------------------------------------------------------

  private rebuildSelectionVisuals(): void {
    for (const vis of this.selectionVisuals) {
      this.selectionGroup.remove(vis.padGroup);
      this.selectionGroup.remove(vis.hitMesh);
      this.selectionGroup.remove(vis.arcMesh);
      this.selectionGroup.remove(vis.ghostMesh);
      vis.outlineMat.dispose();
      vis.fillMat.dispose();
      vis.hitMesh.material instanceof THREE.Material && vis.hitMesh.material.dispose();
      vis.arcMesh.geometry.dispose();
      vis.arcMat.dispose();
      vis.ghostMat.dispose();
    }
    this.selectionVisuals = [];
    this.selectionRunOutline.visible = false;

    const sel = this.activeSelection;
    if (!sel || !this.currentState) return;

    const srcCol = this.currentState.columns[sel.fromCol] ?? [];
    if (srcCol.length === 0 || sel.fromIndex >= srcCol.length) return;

    const { yPositions, faceUpStep } = this.getColumnCardOffsets(srcCol);
    const srcX = this.lastLayout.colCentersX[sel.fromCol] ?? 0;
    const srcY = yPositions[sel.fromIndex] ?? this.lastLayout.tableauTopY;
    const srcZ = BASE_CARD_Z + sel.fromIndex * CARD_Z_STEP + 0.28;

    const runLen = srcCol.length - sel.fromIndex;
    const runH = CARD_HEIGHT + (runLen - 1) * faceUpStep;
    this.selectionRunOutline.visible = true;
    this.selectionRunOutline.scale.set(1.04, runH / CARD_HEIGHT, 1);
    this.selectionRunOutline.position.set(
      srcX,
      srcY - ((runLen - 1) * faceUpStep) * 0.5,
      srcZ + 0.04,
    );

    const leadCard = srcCol[sel.fromIndex];
    const leadTex = this.cardTextures.getFaceTexture(
      leadCard.suit,
      leadCard.rank,
      this.settings.cardFaceTheme,
      this.settings.fourColorDeck,
    );

    const startPt = new THREE.Vector3(srcX, srcY, srcZ + 0.12);

    for (let i = 0; i < sel.destinations.length; i++) {
      const dest = sel.destinations[i];
      const baseColor = dest.wouldCompleteSuit
        ? new THREE.Color(0xffd54f)
        : dest.isSameSuit
          ? new THREE.Color(0x4ade80)
          : dest.isEmpty
            ? new THREE.Color(0x93c5fd)
            : new THREE.Color(0x38bdf8);

      const dropPos = this.getColumnDropTarget(dest.toCol);

      // Pulsing landing pad
      const padGroup = new THREE.Group();
      const outlineMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const fillMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const outline = new THREE.Mesh(this.padOutlineGeo, outlineMat);
      const fill = new THREE.Mesh(this.padPlaneGeo, fillMat);
      fill.position.z = -0.002;
      padGroup.add(outline, fill);
      padGroup.position.set(dropPos.x, dropPos.y, dropPos.z + 0.04);
      this.selectionGroup.add(padGroup);

      // Raycast hit plane for destination click
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const hitMesh = new THREE.Mesh(this.hitPlaneGeo, hitMat);
      hitMesh.position.set(dropPos.x, dropPos.y, dropPos.z + 0.05);
      hitMesh.userData = { destinationCol: dest.toCol };
      this.selectionGroup.add(hitMesh);

      // Smooth Bezier arc tracer from selected run to destination
      const endPt = new THREE.Vector3(dropPos.x, dropPos.y, dropPos.z + 0.12);
      const dx = endPt.x - startPt.x;
      const arcLift = 0.85 + Math.min(0.95, Math.abs(dx) * 0.09);
      const midY = Math.max(startPt.y, endPt.y) + 0.42;

      const curve = new THREE.CubicBezierCurve3(
        startPt,
        new THREE.Vector3(startPt.x + dx * 0.3, midY, arcLift),
        new THREE.Vector3(startPt.x + dx * 0.72, midY, arcLift),
        endPt,
      );

      const tubeGeo = new THREE.TubeGeometry(curve, 26, 0.024, 6, false);
      const arcMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const arcMesh = new THREE.Mesh(tubeGeo, arcMat);
      this.selectionGroup.add(arcMesh);

      // Animated ghost silhouette gliding along the arc toward each destination
      const ghostMat = new THREE.MeshBasicMaterial({
        map: leadTex,
        color: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.55),
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const ghostMesh = new THREE.Mesh(this.padPlaneGeo, ghostMat);
      ghostMesh.scale.setScalar(0.76);
      this.selectionGroup.add(ghostMesh);

      this.selectionVisuals.push({
        toCol: dest.toCol,
        padGroup,
        hitMesh,
        outlineMat,
        fillMat,
        arcMesh,
        arcMat,
        ghostMesh,
        ghostMat,
        curve,
        baseColor,
        phaseOffset: (i * 0.14) % 1,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Golden Sparkle Burst
  // ---------------------------------------------------------------------------

  private emitSparkleBurst(origin: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const sp = this.sparklePool[this.sparkleCursor];
      this.sparkleCursor = (this.sparkleCursor + 1) % this.sparklePool.length;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.1 + Math.random() * 2.8;
      sp.pos.set(
        origin.x + (Math.random() - 0.5) * 0.45,
        origin.y + (Math.random() - 0.5) * 0.45,
        origin.z + 0.15 + Math.random() * 0.25,
      );
      sp.vel.set(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        1.4 + Math.random() * 2.6,
      );
      sp.age = 0;
      sp.maxAge = 0.55 + Math.random() * 0.45;
      sp.baseScale = 0.2 + Math.random() * 0.24;
      sp.active = true;
      sp.sprite.visible = true;
      sp.sprite.position.copy(sp.pos);
      sp.mat.opacity = 1;
      sp.mat.color.setHex(i % 3 === 0 ? 0xffffff : 0xffd54f);
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer Raycasting & Tactile Drag-and-Drop
  // ---------------------------------------------------------------------------

  private updatePointerNdc(clientX: number, clientY: number): boolean {
    if (!this.renderer) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return true;
  }

  private hitTestPressTarget(clientX: number, clientY: number): PressTarget {
    if (!this.updatePointerNdc(clientX, clientY)) return { type: 'empty' };

    // 1. Check Stock cards & stock pad first
    const stockMeshes: THREE.Object3D[] = [];
    for (const ent of this.cardEntities.values()) {
      if (ent.location.zone === 'stock') {
        stockMeshes.push(ent.mesh);
      }
    }
    if (this.stockPadMesh) {
      stockMeshes.push(this.stockPadMesh);
    }
    const stockHits = this.raycaster.intersectObjects(stockMeshes, false);
    if (stockHits.length > 0) {
      return { type: 'stock' };
    }

    // 2. Check highlighted destination pads when selection is active
    if (this.selectionVisuals.length > 0) {
      const destMeshes = this.selectionVisuals.map((v) => v.hitMesh);
      const destHits = this.raycaster.intersectObjects(destMeshes, false);
      if (destHits.length > 0) {
        const toCol = destHits[0].object.userData.destinationCol as number;
        return { type: 'destination', toCol };
      }
    }

    // 3. Check tableau card meshes (nearest hit first)
    const tableauMeshes: THREE.Object3D[] = [];
    for (const ent of this.cardEntities.values()) {
      if (ent.location.zone === 'tableau') {
        tableauMeshes.push(ent.mesh);
      }
    }
    const cardHits = this.raycaster.intersectObjects(tableauMeshes, false);
    if (cardHits.length > 0 && this.currentState) {
      const cardId = cardHits[0].object.userData.cardId as number;
      const ent = this.cardEntities.get(cardId);
      if (ent && ent.location.zone === 'tableau') {
        const { col, index } = ent.location;
        const colCards = this.currentState.columns[col] ?? [];
        const movableStart = this.getMovableStartIndex(colCards);
        const card = colCards[index];
        const isMovable = Boolean(card?.faceUp) && index >= movableStart;
        return {
          type: 'card',
          col,
          index,
          cardId,
          isMovable,
        };
      }
    }

    // 4. Check empty column pads if selection targets an empty column
    if (this.activeSelection && this.tableauPadMeshes.length > 0) {
      const padHits = this.raycaster.intersectObjects(this.tableauPadMeshes, false);
      if (padHits.length > 0) {
        const hitIdx = this.tableauPadMeshes.indexOf(padHits[0].object as THREE.Mesh);
        if (
          hitIdx >= 0 &&
          this.activeSelection.destinations.some((d) => d.toCol === hitIdx)
        ) {
          return { type: 'destination', toCol: hitIdx };
        }
      }
    }

    return { type: 'empty' };
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.currentState) return;
    if (this.winCelebration.isRunning()) return;

    this.pressActivePointerId = e.pointerId;
    this.pressStartClient.set(e.clientX, e.clientY);
    this.pressTarget = this.hitTestPressTarget(e.clientX, e.clientY);
  }

  private canDropRunOnColumn(
    fromCol: number,
    leadCard: Card,
    toCol: number,
  ): { valid: boolean; sameSuit: boolean } {
    if (!this.currentState || toCol === fromCol) {
      return { valid: false, sameSuit: false };
    }
    const destCol = this.currentState.columns[toCol];
    if (!destCol) return { valid: false, sameSuit: false };
    if (destCol.length === 0) {
      return { valid: true, sameSuit: false };
    }
    const topCard = destCol[destCol.length - 1];
    if (!topCard.faceUp) return { valid: false, sameSuit: false };
    if (topCard.rank === leadCard.rank + 1) {
      return { valid: true, sameSuit: topCard.suit === leadCard.suit };
    }
    return { valid: false, sameSuit: false };
  }

  private findBestHoverColumn(
    leadPos: THREE.Vector3,
    fromCol: number,
    leadCard: Card,
  ): { col: number | null; sameSuit: boolean } {
    if (!this.currentState) return { col: null, sameSuit: false };

    let bestCol: number | null = null;
    let bestSameSuit = false;
    let bestScore = Infinity;

    const maxHorizDist = this.lastLayout.colPitch * 0.78;
    for (let c = 0; c < this.lastLayout.numCols; c++) {
      if (c === fromCol) continue;
      const check = this.canDropRunOnColumn(fromCol, leadCard, c);
      if (!check.valid) continue;

      const dropTarget = this.getColumnDropTarget(c);
      const dx = Math.abs(leadPos.x - dropTarget.x);
      if (dx > maxHorizDist) continue;

      // Allow generous vertical overlap anywhere along the target column
      const colTop = this.lastLayout.tableauTopY + CARD_HEIGHT * 0.6;
      const colBot = Math.min(dropTarget.y, this.lastLayout.tableauMinBottomY) - CARD_HEIGHT * 0.7;
      if (leadPos.y > colTop || leadPos.y < colBot) continue;

      const dist = dx + Math.abs(leadPos.y - dropTarget.y) * 0.18;
      if (dist < bestScore) {
        bestScore = dist;
        bestCol = c;
        bestSameSuit = check.sameSuit;
      }
    }

    return { col: bestCol, sameSuit: bestSameSuit };
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.pressActivePointerId !== e.pointerId) return;
    if (!this.currentState) return;

    if (!this.dragState && this.pressTarget?.type === 'card') {
      const distPx = Math.hypot(
        e.clientX - this.pressStartClient.x,
        e.clientY - this.pressStartClient.y,
      );
      if (distPx > 6) {
        if (!this.pressTarget.isMovable) {
          this.pulseLockedCard(this.pressTarget.col, this.pressTarget.index);
          this.pressTarget = null;
          this.pressActivePointerId = null;
          return;
        }

        // Initiate drag!
        const { col, index } = this.pressTarget;
        const colCards = this.currentState.columns[col] ?? [];
        const runIds = colCards.slice(index).map((c) => c.id);
        const leadEnt = this.cardEntities.get(runIds[0]);
        if (!leadEnt) return;

        this.clearHint();
        this.showSelectionTargets(null);

        const dragZ = 0.85;
        this.dragPlane.constant = -dragZ;
        const hitPt = new THREE.Vector3();
        this.updatePointerNdc(e.clientX, e.clientY);
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, hitPt)) {
          hitPt.copy(leadEnt.currentPos);
        }

        const { faceUpStep } = this.getColumnCardOffsets(colCards);
        const leadOffset = new THREE.Vector2(
          leadEnt.currentPos.x - hitPt.x,
          leadEnt.currentPos.y - hitPt.y,
        );

        const initTarget = new THREE.Vector3(
          hitPt.x + leadOffset.x,
          hitPt.y + leadOffset.y,
          dragZ,
        );

        // Cancel any flights on dragged cards
        for (const cid of runIds) {
          this.flights.delete(cid);
        }

        this.dragState = {
          fromCol: col,
          fromIndex: index,
          cardIds: runIds,
          leadOffset,
          leadTargetPos: initTarget.clone(),
          prevLeadPos: initTarget.clone(),
          vel: new THREE.Vector2(0, 0),
          stepY: Math.max(0.32, Math.min(0.42, faceUpStep)),
          hoverCol: null,
          hoverIsSameSuit: false,
        };

        this.callbacks.onAnimationEvent?.('pickup');
      }
    }

    if (this.dragState) {
      this.updatePointerNdc(e.clientX, e.clientY);
      const hitPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, hitPt)) {
        this.dragState.leadTargetPos.set(
          hitPt.x + this.dragState.leadOffset.x,
          hitPt.y + this.dragState.leadOffset.y,
          0.85,
        );
      }

      const leadCard =
        this.currentState.columns[this.dragState.fromCol]?.[
          this.dragState.fromIndex
        ];
      if (leadCard) {
        const hover = this.findBestHoverColumn(
          this.dragState.leadTargetPos,
          this.dragState.fromCol,
          leadCard,
        );
        this.dragState.hoverCol = hover.col;
        this.dragState.hoverIsSameSuit = hover.sameSuit;

        if (hover.col !== null) {
          const dropPos = this.getColumnDropTarget(hover.col);
          this.dragHoverPad.visible = true;
          this.dragHoverPad.position.set(dropPos.x, dropPos.y, dropPos.z + 0.04);
          const glowHex = hover.sameSuit ? 0xffd54f : 0x38bdf8;
          this.dragHoverOutlineMat.color.setHex(glowHex);
          this.dragHoverFillMat.color.setHex(glowHex);
        } else {
          this.dragHoverPad.visible = false;
        }
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.pressActivePointerId !== e.pointerId) return;
    this.pressActivePointerId = null;

    if (this.dragState) {
      const drag = this.dragState;
      this.dragState = null;
      this.dragHoverPad.visible = false;

      if (drag.hoverCol !== null) {
        this.pendingDropSnap = true;
        this.callbacks.onAttemptMove(drag.fromCol, drag.fromIndex, drag.hoverCol);
        // If syncState wasn't called synchronously (e.g. rejected move), spring cards back to fromCol
        if (this.pendingDropSnap) {
          this.pendingDropSnap = false;
          this.recomputeTargetsFromCurrentState(false);
        }
      } else {
        // Released over invalid space -> spring smoothly back to fromCol
        this.recomputeTargetsFromCurrentState(false);
      }
      this.pressTarget = null;
      return;
    }

    // Handle click (not a drag)
    const target = this.pressTarget;
    this.pressTarget = null;
    if (!target) return;

    if (target.type === 'stock') {
      this.callbacks.onStockClick();
      return;
    }

    if (target.type === 'destination') {
      this.callbacks.onDestinationClick(target.toCol);
      return;
    }

    if (target.type === 'empty') {
      this.callbacks.onEmptySpaceClick();
      return;
    }

    // target.type === 'card'
    if (
      this.activeSelection &&
      this.activeSelection.destinations.some((d) => d.toCol === target.col)
    ) {
      this.callbacks.onDestinationClick(target.col);
      return;
    }

    const now = performance.now();
    const isDoubleClick =
      this.lastClickInfo !== null &&
      this.lastClickInfo.col === target.col &&
      this.lastClickInfo.index === target.index &&
      now - this.lastClickInfo.time < 340;

    if (isDoubleClick) {
      this.lastClickInfo = null;
      this.callbacks.onCardDoubleClick(target.col, target.index);
    } else {
      this.lastClickInfo = { col: target.col, index: target.index, time: now };
      this.callbacks.onCardClick(target.col, target.index);
    }
  }

  // ---------------------------------------------------------------------------
  // Frame Animation Update Loop
  // ---------------------------------------------------------------------------

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.1);
      this.update(dt);
      this.renderer?.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    this.clockElapsed += dt;
    const speedMult = getAnimationSpeedMultiplier(this.settings.animationSpeed);
    const animDt = dt * speedMult;

    // 1. Smoothly interpolate camera tilt if preset/slider changed
    if (Math.abs(this.currentTiltDeg - this.targetTiltDeg) > 0.02) {
      const lerpAlpha = 1 - Math.exp(-9 * dt);
      this.currentTiltDeg = THREE.MathUtils.lerp(
        this.currentTiltDeg,
        this.targetTiltDeg,
        lerpAlpha,
      );
      const width = this.container ? Math.max(1, this.container.clientWidth) : 1280;
      const height = this.container ? Math.max(1, this.container.clientHeight) : 720;
      const spec = getDeckLayoutSpec(this.currentState?.config.decks ?? 2);
      this.lastLayout = this.computeLayout(
        width,
        height,
        spec.columns,
        spec.foundationSlots,
        this.currentTiltDeg,
      );
      this.updateCameraTransform();
    }

    // 2. Update dragged run physics (Z-lift, velocity tilt, cascade trailing spring lag)
    const draggedIds = new Set<number>();
    if (this.dragState) {
      const drag = this.dragState;
      const instVx = (drag.leadTargetPos.x - drag.prevLeadPos.x) / Math.max(dt, 0.004);
      const instVy = (drag.leadTargetPos.y - drag.prevLeadPos.y) / Math.max(dt, 0.004);
      const velLerp = 1 - Math.exp(-16 * dt);
      drag.vel.x = THREE.MathUtils.lerp(drag.vel.x, instVx, velLerp);
      drag.vel.y = THREE.MathUtils.lerp(drag.vel.y, instVy, velLerp);
      drag.prevLeadPos.copy(drag.leadTargetPos);

      const tiltY = THREE.MathUtils.clamp(drag.vel.x * 0.028, -0.24, 0.24);
      const tiltX = THREE.MathUtils.clamp(-drag.vel.y * 0.022, -0.18, 0.18);
      const tiltZ = THREE.MathUtils.clamp(-drag.vel.x * 0.012, -0.09, 0.09);

      for (let i = 0; i < drag.cardIds.length; i++) {
        const cid = drag.cardIds[i];
        draggedIds.add(cid);
        const ent = this.cardEntities.get(cid);
        if (!ent) continue;

        if (i === 0) {
          const followAlpha = 1 - Math.exp(-38 * dt);
          ent.currentPos.lerp(drag.leadTargetPos, followAlpha);
          ent.currentRot.x = THREE.MathUtils.lerp(ent.currentRot.x, tiltX, 1 - Math.exp(-18 * dt));
          ent.currentRot.y = THREE.MathUtils.lerp(ent.currentRot.y, tiltY, 1 - Math.exp(-18 * dt));
          ent.currentRot.z = THREE.MathUtils.lerp(ent.currentRot.z, tiltZ, 1 - Math.exp(-18 * dt));
        } else {
          const prevEnt = this.cardEntities.get(drag.cardIds[i - 1]);
          if (prevEnt) {
            const desiredPos = new THREE.Vector3(
              prevEnt.currentPos.x,
              prevEnt.currentPos.y - drag.stepY,
              prevEnt.currentPos.z + CARD_Z_STEP,
            );
            const springAlpha = 1 - Math.exp(-26 * dt);
            ent.currentPos.lerp(desiredPos, springAlpha);
            ent.currentRot.x = THREE.MathUtils.lerp(ent.currentRot.x, tiltX * 0.75, 1 - Math.exp(-14 * dt));
            ent.currentRot.y = THREE.MathUtils.lerp(ent.currentRot.y, tiltY * 0.75, 1 - Math.exp(-14 * dt));
            ent.currentRot.z = THREE.MathUtils.lerp(ent.currentRot.z, tiltZ * 0.65, 1 - Math.exp(-14 * dt));
          }
        }
        ent.mesh.position.copy(ent.currentPos);
        ent.mesh.rotation.copy(ent.currentRot);
      }

      if (this.dragHoverPad.visible) {
        const pulse = 0.8 + 0.2 * Math.sin(this.clockElapsed * 8);
        this.dragHoverOutlineMat.opacity = pulse;
        this.dragHoverFillMat.opacity = 0.14 + 0.08 * Math.sin(this.clockElapsed * 8);
      }
    }

    // 3. Update active parabolic card flights
    for (const [cardId, flight] of this.flights) {
      const ent = this.cardEntities.get(cardId);
      if (!ent) {
        this.flights.delete(cardId);
        continue;
      }

      if (flight.delay > 0) {
        flight.delay -= animDt;
        continue;
      }

      if (!flight.started) {
        flight.started = true;
        if (flight.soundAtStart) {
          this.callbacks.onAnimationEvent?.(flight.soundAtStart);
        }
      }

      flight.elapsed += animDt;
      const rawT = Math.min(1, flight.elapsed / Math.max(0.01, flight.duration));
      const t = easeOutCubic(rawT);

      ent.currentPos.lerpVectors(flight.startPos, flight.endPos, t);
      ent.currentPos.z += 4 * rawT * (1 - rawT) * flight.peakZ;

      const flipT =
        flight.flipDelayFrac < 1
          ? smoothstep(flight.flipDelayFrac, 1, rawT)
          : 0;
      ent.currentRot.x = THREE.MathUtils.lerp(flight.startRot.x, flight.endRot.x, t);
      ent.currentRot.y = THREE.MathUtils.lerp(flight.startRot.y, flight.endRot.y, flipT);
      ent.currentRot.z =
        THREE.MathUtils.lerp(flight.startRot.z, flight.endRot.z, t) +
        Math.sin(rawT * Math.PI) * flight.bankRoll;

      ent.currentScale = THREE.MathUtils.lerp(
        flight.startScale,
        flight.endScale,
        t,
      );

      ent.mesh.position.copy(ent.currentPos);
      ent.mesh.rotation.copy(ent.currentRot);
      ent.mesh.scale.setScalar(ent.currentScale);

      if (rawT >= 1) {
        if (flight.soundAtLand) {
          this.callbacks.onAnimationEvent?.(flight.soundAtLand);
        }
        if (flight.sparkleOnLand) {
          this.emitSparkleBurst(ent.currentPos, 16);
        }

        if (flight.nextStage) {
          const ns = flight.nextStage;
          flight.startPos.copy(ent.currentPos);
          flight.endPos.copy(ns.pos);
          flight.startRot.copy(ent.currentRot);
          flight.endRot.set(0, ns.rotY, 0);
          flight.startScale = ent.currentScale;
          flight.endScale = ns.scale;
          flight.duration = ns.duration;
          flight.peakZ = ns.peakZ;
          flight.elapsed = 0;
          flight.delay = 0.02;
          flight.flipDelayFrac = 0;
          flight.nextStage = undefined;
          flight.soundAtStart = ent.rank === 1 ? 'complete-suit' : undefined;
          flight.soundAtLand = undefined;
          flight.sparkleOnLand = ent.rank % 3 === 1 || ent.rank === 13;
          flight.started = false;
        } else {
          this.flights.delete(cardId);
        }
      }
    }

    // 4. Update resting / springing / locked dimming / pulse wobble on all non-flying, non-dragged cards
    const facePalette = CARD_FACE_PALETTES[this.settings.cardFaceTheme];
    const normalColor = new THREE.Color(0xffffff);
    const dimColor = new THREE.Color(facePalette.lockedTintHex);
    const blockedFlashColor = new THREE.Color(0xff9b8f);

    for (const ent of this.cardEntities.values()) {
      // Smooth dim blend for dimLockedCards
      const wantDim = this.settings.dimLockedCards && ent.isLocked ? 1 : 0;
      ent.dimBlend = THREE.MathUtils.lerp(ent.dimBlend, wantDim, 1 - Math.exp(-12 * dt));

      const baseTint = normalColor.clone().lerp(dimColor, ent.dimBlend);

      // Pulse wobble when locked card is clicked
      let wobbleX = 0;
      if (ent.pulseDuration > 0) {
        ent.pulseElapsed += dt;
        const pt = Math.min(1, ent.pulseElapsed / ent.pulseDuration);
        wobbleX = Math.sin(pt * Math.PI * 6) * 0.11 * (1 - pt);
        const flashAmt = Math.sin(pt * Math.PI) * 0.65;
        baseTint.lerp(blockedFlashColor, flashAmt);
        if (pt >= 1) {
          ent.pulseDuration = 0;
        }
      }
      ent.frontMat.color.copy(baseTint);

      if (draggedIds.has(ent.id) || this.flights.has(ent.id)) {
        continue;
      }

      const springAlpha = 1 - Math.exp(-16 * animDt);
      const desiredZ = ent.isSelected
        ? ent.targetPos.z + 0.28 + Math.sin(this.clockElapsed * 4.2) * 0.02
        : ent.targetPos.z;
      const desiredPos = new THREE.Vector3(
        ent.targetPos.x + wobbleX,
        ent.targetPos.y,
        desiredZ,
      );

      ent.currentPos.lerp(desiredPos, springAlpha);
      ent.currentRot.x = THREE.MathUtils.lerp(ent.currentRot.x, ent.targetRot.x, springAlpha);
      ent.currentRot.y = THREE.MathUtils.lerp(ent.currentRot.y, ent.targetRot.y, springAlpha);
      ent.currentRot.z = THREE.MathUtils.lerp(ent.currentRot.z, ent.targetRot.z, springAlpha);
      ent.currentScale = THREE.MathUtils.lerp(ent.currentScale, ent.targetScale, springAlpha);

      ent.mesh.position.copy(ent.currentPos);
      ent.mesh.rotation.copy(ent.currentRot);
      ent.mesh.scale.setScalar(ent.currentScale);
    }

    // 5. Update Hint ghost Bezier animation
    if (this.activeHint) {
      this.hintElapsed += dt;
      if (this.activeHint.kind === 'deal') {
        const cycle = (this.hintElapsed % 1.4) / 1.4;
        const lift = Math.sin(cycle * Math.PI) * 0.55;
        if (this.hintGhostGroup.children.length > 0 && this.currentState) {
          const stockTop = this.getStockWavePosition(
            Math.max(0, this.currentState.stock.length - 1),
            Math.max(1, this.currentState.stock.length),
            0,
          );
          this.hintGhostGroup.position.set(
            stockTop.x,
            stockTop.y,
            stockTop.z + 0.06 + lift,
          );
          for (const mat of this.hintGhostMats) {
            mat.opacity = 0.45 + 0.35 * Math.sin(cycle * Math.PI);
          }
        }
        if (this.hintStockRing) {
          const mat = this.hintStockRing.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.55 + 0.4 * Math.sin(this.hintElapsed * 6);
          const s = 1 + 0.05 * Math.sin(this.hintElapsed * 6);
          this.hintStockRing.scale.set(s, s, 1);
        }
      } else if (this.hintCurve) {
        const cycleDur = 1.9;
        const cycle = (this.hintElapsed % cycleDur) / cycleDur;
        const flyFrac = Math.min(1, cycle / 0.72);
        const eased = easeInOutCubic(flyFrac);
        const pt = this.hintCurve.getPoint(eased);

        this.hintGhostGroup.position.copy(pt);
        this.hintGhostGroup.rotation.set(
          -Math.sin(flyFrac * Math.PI) * 0.14,
          0,
          Math.sin(flyFrac * Math.PI) * 0.06,
        );

        let opacity = 0.8;
        if (cycle < 0.08) opacity = (cycle / 0.08) * 0.8;
        else if (cycle > 0.86) opacity = Math.max(0, (1 - cycle) / 0.14) * 0.8;
        for (const mat of this.hintGhostMats) {
          mat.opacity = opacity;
        }

        if (this.hintArcMat) {
          this.hintArcMat.opacity = 0.35 + 0.25 * Math.sin(this.hintElapsed * 5);
        }
        if (this.hintDestOutline) {
          const pulse = 0.55 + 0.4 * Math.sin(this.hintElapsed * 6.5);
          (this.hintDestOutline.material as THREE.MeshBasicMaterial).opacity = pulse;
          const s = 1 + 0.045 * Math.sin(this.hintElapsed * 6.5);
          this.hintDestOutline.scale.set(s, s, 1);
        }
      }
    }

    // 6. Update Click-Card Multi-Destination animated tracers & pulsing target pads
    if (this.selectionVisuals.length > 0) {
      this.selectionElapsed += dt;
      this.selectionRunOutlineMat.opacity = 0.72 + 0.25 * Math.sin(this.clockElapsed * 6);

      for (const vis of this.selectionVisuals) {
        const pulse = 0.5 + 0.5 * Math.sin(this.clockElapsed * 5.2 + vis.phaseOffset * Math.PI * 2);
        vis.outlineMat.opacity = 0.64 + 0.32 * pulse;
        vis.fillMat.opacity = 0.12 + 0.16 * pulse;
        const padScale = 1 + 0.038 * pulse;
        vis.padGroup.scale.set(padScale, padScale, 1);

        vis.arcMat.opacity = 0.28 + 0.26 * pulse;

        // Animated translucent ghost flying repeatedly along each destination curve
        const t = (this.selectionElapsed * 0.85 + vis.phaseOffset) % 1;
        const eased = easeInOutCubic(t);
        const pt = vis.curve.getPoint(eased);
        vis.ghostMesh.position.copy(pt);

        let gOp = 0.62;
        if (t < 0.15) gOp = (t / 0.15) * 0.62;
        else if (t > 0.82) gOp = ((1 - t) / 0.18) * 0.62;
        vis.ghostMat.opacity = gOp;
      }
    }

    // 7. Update golden sparkle burst particles
    for (const sp of this.sparklePool) {
      if (!sp.active) continue;
      sp.age += dt;
      const t = sp.age / sp.maxAge;
      if (t >= 1) {
        sp.active = false;
        sp.sprite.visible = false;
        continue;
      }
      sp.vel.z -= 5.2 * dt;
      sp.pos.addScaledVector(sp.vel, dt);
      sp.sprite.position.copy(sp.pos);
      const s = sp.baseScale * (1 - t * 0.5) * (0.7 + 0.3 * Math.sin(t * Math.PI));
      sp.sprite.scale.set(s, s, 1);
      sp.mat.opacity = 1 - t * t;
    }

    // 8. Update 3D victory cascade
    this.winCelebration.update(dt);
  }
}
