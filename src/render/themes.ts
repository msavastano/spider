import type {
  AnimationSpeed,
  CardBackTheme,
  CardFaceTheme,
  FeltTheme,
  Suit,
  UserSettings,
} from '../engine/types';

export interface CardFacePalette {
  id: CardFaceTheme;
  isDark: boolean;
  paperTop: string;
  paperBottom: string;
  headerBandBg: string;
  headerDivider: string;
  borderOuter: string;
  borderInner: string;
  edgeColor: number;
  courtBg: string;
  courtFrame: string;
  courtAccent: string;
  courtSecondary: string;
  rankFontFamily: string;
  rankWeight: string;
  jumboLayout: boolean;
  modernStripe: boolean;
  lockedTintHex: number;
  suitColors2: Record<Suit, string>;
  suitColors4: Record<Suit, string>;
}

export interface CardBackPalette {
  id: CardBackTheme;
  marginColor: string;
  baseTop: string;
  baseBottom: string;
  primaryAccent: string;
  secondaryAccent: string;
  metallicFoil: string;
  detailStroke: string;
  highlightColor: string;
}

export interface FeltPalette {
  id: FeltTheme;
  surfaceType: 'felt' | 'wood';
  centerColor: string;
  midColor: string;
  edgeColor: string;
  fiberLight: string;
  fiberDark: string;
  slotStroke: string;
  slotFill: string;
  slotText: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  ambientColor: number;
  ambientIntensity: number;
  keyLightColor: number;
  keyLightIntensity: number;
  fillLightColor: number;
  fillLightIntensity: number;
  rimLightColor: number;
  backgroundHex: number;
}

export const CARD_FACE_PALETTES: Record<CardFaceTheme, CardFacePalette> = {
  classic: {
    id: 'classic',
    isDark: false,
    paperTop: '#FFFDF8',
    paperBottom: '#F5EFE2',
    headerBandBg: 'rgba(244, 237, 222, 0.42)',
    headerDivider: 'rgba(138, 120, 88, 0.22)',
    borderOuter: '#CFC4AE',
    borderInner: 'rgba(155, 134, 96, 0.36)',
    edgeColor: 0xebe4d4,
    courtBg: '#FAF4E6',
    courtFrame: '#B48E44',
    courtAccent: '#D4A84E',
    courtSecondary: '#2C3F6E',
    rankFontFamily: '"Georgia", "Times New Roman", "Liberation Serif", serif',
    rankWeight: '700',
    jumboLayout: false,
    modernStripe: false,
    lockedTintHex: 0xb6bec9,
    suitColors2: {
      spades: '#171923',
      hearts: '#C41C2B',
      diamonds: '#C41C2B',
      clubs: '#171923',
    },
    suitColors4: {
      spades: '#171923',
      hearts: '#C41C2B',
      diamonds: '#1455C0',
      clubs: '#167B3E',
    },
  },
  jumbo: {
    id: 'jumbo',
    isDark: false,
    paperTop: '#FFFFFF',
    paperBottom: '#F5F7FA',
    headerBandBg: 'rgba(235, 240, 248, 0.55)',
    headerDivider: 'rgba(30, 41, 59, 0.16)',
    borderOuter: '#CBD5E1',
    borderInner: 'rgba(100, 116, 139, 0.22)',
    edgeColor: 0xf0f3f7,
    courtBg: '#F4F7FB',
    courtFrame: '#64748B',
    courtAccent: '#D97706',
    courtSecondary: '#1E3A8A',
    rankFontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    rankWeight: '900',
    jumboLayout: true,
    modernStripe: false,
    lockedTintHex: 0xb4bdc8,
    suitColors2: {
      spades: '#0F172A',
      hearts: '#DC1D2E',
      diamonds: '#DC1D2E',
      clubs: '#0F172A',
    },
    suitColors4: {
      spades: '#0F172A',
      hearts: '#DC1D2E',
      diamonds: '#0F5CD6',
      clubs: '#12823D',
    },
  },
  modern: {
    id: 'modern',
    isDark: false,
    paperTop: '#FCFDFE',
    paperBottom: '#EEF2F7',
    headerBandBg: 'rgba(226, 232, 240, 0.45)',
    headerDivider: 'rgba(71, 85, 105, 0.18)',
    borderOuter: '#CBD5E1',
    borderInner: 'rgba(148, 163, 184, 0.28)',
    edgeColor: 0xe7ecf2,
    courtBg: '#F1F5F9',
    courtFrame: '#475569',
    courtAccent: '#0EA5E9',
    courtSecondary: '#C89B3C',
    rankFontFamily: '"Inter", "SF Pro Display", "Segoe UI", system-ui, sans-serif',
    rankWeight: '800',
    jumboLayout: false,
    modernStripe: true,
    lockedTintHex: 0xb3bcc7,
    suitColors2: {
      spades: '#182030',
      hearts: '#CF2238',
      diamonds: '#CF2238',
      clubs: '#182030',
    },
    suitColors4: {
      spades: '#182030',
      hearts: '#CF2238',
      diamonds: '#1A66E0',
      clubs: '#128453',
    },
  },
  midnight: {
    id: 'midnight',
    isDark: true,
    paperTop: '#1A2030',
    paperBottom: '#10141F',
    headerBandBg: 'rgba(34, 42, 64, 0.65)',
    headerDivider: 'rgba(212, 175, 96, 0.34)',
    borderOuter: '#53472B',
    borderInner: 'rgba(212, 175, 96, 0.42)',
    edgeColor: 0x2d3448,
    courtBg: '#161C2B',
    courtFrame: '#C9A34E',
    courtAccent: '#F3CD74',
    courtSecondary: '#5B8DEF',
    rankFontFamily: '"Inter", "Segoe UI", "Roboto", system-ui, sans-serif',
    rankWeight: '800',
    jumboLayout: false,
    modernStripe: true,
    lockedTintHex: 0x7a8396,
    suitColors2: {
      spades: '#F2F5FA',
      hearts: '#FF4F61',
      diamonds: '#FF4F61',
      clubs: '#F2F5FA',
    },
    suitColors4: {
      spades: '#F2F5FA',
      hearts: '#FF4F61',
      diamonds: '#4AA8FF',
      clubs: '#3CE07A',
    },
  },
};

export const CARD_BACK_PALETTES: Record<CardBackTheme, CardBackPalette> = {
  'spider-web': {
    id: 'spider-web',
    marginColor: '#F3ECE0',
    baseTop: '#151B2E',
    baseBottom: '#0B0E18',
    primaryAccent: '#C99B3B',
    secondaryAccent: '#8C1D2F',
    metallicFoil: '#F3D078',
    detailStroke: 'rgba(232, 195, 108, 0.65)',
    highlightColor: '#FFE8A3',
  },
  'royal-crimson': {
    id: 'royal-crimson',
    marginColor: '#F8F2E7',
    baseTop: '#8A1526',
    baseBottom: '#4A0813',
    primaryAccent: '#D4A84E',
    secondaryAccent: '#B5243A',
    metallicFoil: '#F6D782',
    detailStroke: 'rgba(244, 211, 126, 0.56)',
    highlightColor: '#FFF1C2',
  },
  'emerald-guild': {
    id: 'emerald-guild',
    marginColor: '#F5F2E9',
    baseTop: '#0F5B40',
    baseBottom: '#072E20',
    primaryAccent: '#D1AA58',
    secondaryAccent: '#1D825D',
    metallicFoil: '#F2D28B',
    detailStroke: 'rgba(229, 196, 124, 0.58)',
    highlightColor: '#FFF0C9',
  },
  'celestial-gold': {
    id: 'celestial-gold',
    marginColor: '#F4F1EA',
    baseTop: '#19244D',
    baseBottom: '#0D132B',
    primaryAccent: '#E2B652',
    secondaryAccent: '#2C4285',
    metallicFoil: '#FFE08A',
    detailStroke: 'rgba(255, 224, 138, 0.62)',
    highlightColor: '#FFF6D1',
  },
  'minimal-slate': {
    id: 'minimal-slate',
    marginColor: '#EDF1F5',
    baseTop: '#333C4D',
    baseBottom: '#1E2430',
    primaryAccent: '#94A3B8',
    secondaryAccent: '#475569',
    metallicFoil: '#E2E8F0',
    detailStroke: 'rgba(203, 213, 225, 0.45)',
    highlightColor: '#F8FAFC',
  },
};

export const FELT_PALETTES: Record<FeltTheme, FeltPalette> = {
  emerald: {
    id: 'emerald',
    surfaceType: 'felt',
    centerColor: '#166341',
    midColor: '#0E482E',
    edgeColor: '#062115',
    fiberLight: 'rgba(72, 184, 126, 0.08)',
    fiberDark: 'rgba(3, 20, 12, 0.14)',
    slotStroke: 'rgba(220, 245, 228, 0.24)',
    slotFill: 'rgba(4, 24, 15, 0.26)',
    slotText: 'rgba(220, 245, 228, 0.34)',
    roughness: 0.9,
    metalness: 0.02,
    bumpScale: 0.022,
    ambientColor: 0xe6f7ed,
    ambientIntensity: 0.85,
    keyLightColor: 0xfff8eb,
    keyLightIntensity: 1.35,
    fillLightColor: 0xb7e4cf,
    fillLightIntensity: 0.48,
    rimLightColor: 0x82e6b8,
    backgroundHex: 0x051c11,
  },
  sapphire: {
    id: 'sapphire',
    surfaceType: 'felt',
    centerColor: '#164173',
    midColor: '#0F2E54',
    edgeColor: '#061529',
    fiberLight: 'rgba(92, 158, 232, 0.08)',
    fiberDark: 'rgba(4, 14, 30, 0.15)',
    slotStroke: 'rgba(210, 230, 255, 0.24)',
    slotFill: 'rgba(5, 16, 36, 0.28)',
    slotText: 'rgba(210, 230, 255, 0.35)',
    roughness: 0.9,
    metalness: 0.02,
    bumpScale: 0.022,
    ambientColor: 0xe4f0ff,
    ambientIntensity: 0.85,
    keyLightColor: 0xfff8ee,
    keyLightIntensity: 1.35,
    fillLightColor: 0xa7c8f7,
    fillLightIntensity: 0.5,
    rimLightColor: 0x7cb8ff,
    backgroundHex: 0x051224,
  },
  burgundy: {
    id: 'burgundy',
    surfaceType: 'felt',
    centerColor: '#69192B',
    midColor: '#4B101E',
    edgeColor: '#23060D',
    fiberLight: 'rgba(205, 86, 112, 0.08)',
    fiberDark: 'rgba(22, 4, 8, 0.16)',
    slotStroke: 'rgba(255, 224, 214, 0.24)',
    slotFill: 'rgba(26, 4, 10, 0.28)',
    slotText: 'rgba(255, 224, 214, 0.34)',
    roughness: 0.9,
    metalness: 0.02,
    bumpScale: 0.022,
    ambientColor: 0xffeef0,
    ambientIntensity: 0.86,
    keyLightColor: 0xfff6ea,
    keyLightIntensity: 1.35,
    fillLightColor: 0xf0b2be,
    fillLightIntensity: 0.46,
    rimLightColor: 0xf59eb0,
    backgroundHex: 0x1d050b,
  },
  obsidian: {
    id: 'obsidian',
    surfaceType: 'felt',
    centerColor: '#29303D',
    midColor: '#1C212B',
    edgeColor: '#0D1016',
    fiberLight: 'rgba(148, 163, 184, 0.07)',
    fiberDark: 'rgba(5, 7, 11, 0.18)',
    slotStroke: 'rgba(226, 232, 240, 0.22)',
    slotFill: 'rgba(8, 10, 15, 0.34)',
    slotText: 'rgba(226, 232, 240, 0.32)',
    roughness: 0.88,
    metalness: 0.04,
    bumpScale: 0.02,
    ambientColor: 0xedf2fa,
    ambientIntensity: 0.88,
    keyLightColor: 0xfffaf0,
    keyLightIntensity: 1.38,
    fillLightColor: 0xb6c5dc,
    fillLightIntensity: 0.5,
    rimLightColor: 0x9cb4d8,
    backgroundHex: 0x0a0d12,
  },
  mahogany: {
    id: 'mahogany',
    surfaceType: 'wood',
    centerColor: '#5B2B18',
    midColor: '#3E1C0F',
    edgeColor: '#1D0B05',
    fiberLight: 'rgba(194, 112, 68, 0.14)',
    fiberDark: 'rgba(26, 9, 3, 0.24)',
    slotStroke: 'rgba(246, 214, 168, 0.26)',
    slotFill: 'rgba(24, 9, 4, 0.30)',
    slotText: 'rgba(246, 214, 168, 0.36)',
    roughness: 0.46,
    metalness: 0.06,
    bumpScale: 0.016,
    ambientColor: 0xfff0e2,
    ambientIntensity: 0.86,
    keyLightColor: 0xfff5e4,
    keyLightIntensity: 1.42,
    fillLightColor: 0xe8bfa0,
    fillLightIntensity: 0.46,
    rimLightColor: 0xf5be88,
    backgroundHex: 0x170804,
  },
};

export function getSuitColor(
  suit: Suit,
  fourColorDeck: boolean,
  faceTheme: CardFaceTheme,
): string {
  const palette = CARD_FACE_PALETTES[faceTheme];
  return fourColorDeck ? palette.suitColors4[suit] : palette.suitColors2[suit];
}

export function getCameraTiltDeg(settings: UserSettings): number {
  if (settings.cameraPreset === 'overhead') {
    return 2;
  }
  if (settings.cameraPreset === 'classic-3d') {
    return 18;
  }
  return Math.max(0, Math.min(28, settings.cameraTiltDeg));
}

export function getAnimationSpeedMultiplier(speed: AnimationSpeed): number {
  if (speed === 'relaxed') return 0.68;
  if (speed === 'snappy') return 1.58;
  return 1.0;
}
