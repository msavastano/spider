import {
  getModeKey,
  type AnimationSpeed,
  type CardBackTheme,
  type CardFaceTheme,
  type CameraPreset,
  type DeckCount,
  type FeltTheme,
  type GameConfig,
  type GameState,
  type ModeStats,
  type PlayerStats,
  type ResolvedGameConfig,
  type SavedSlot,
  type SuitCount,
  type UserSettings,
} from '../engine/types';

const STORAGE_PREFIX = 'spider3d:v1';

const KEYS = {
  settings: `${STORAGE_PREFIX}:settings`,
  activeGame: `${STORAGE_PREFIX}:active-game`,
  stats: `${STORAGE_PREFIX}:stats`,
  savedSlots: `${STORAGE_PREFIX}:saved-slots`,
  usedWinningSeeds: `${STORAGE_PREFIX}:used-winning-seeds`,
} as const;

const MAX_SAVED_SLOTS = 24;
const MAX_USED_SEEDS_PER_MODE = 500;

const VALID_CARD_FACE_THEMES: ReadonlySet<CardFaceTheme> = new Set([
  'classic',
  'jumbo',
  'modern',
  'midnight',
]);

const VALID_CARD_BACK_THEMES: ReadonlySet<CardBackTheme> = new Set([
  'spider-web',
  'royal-crimson',
  'emerald-guild',
  'celestial-gold',
  'minimal-slate',
]);

const VALID_FELT_THEMES: ReadonlySet<FeltTheme> = new Set([
  'emerald',
  'sapphire',
  'burgundy',
  'obsidian',
  'mahogany',
]);

const VALID_CAMERA_PRESETS: ReadonlySet<CameraPreset> = new Set([
  'overhead',
  'classic-3d',
  'custom',
]);

const VALID_ANIMATION_SPEEDS: ReadonlySet<AnimationSpeed> = new Set([
  'relaxed',
  'normal',
  'snappy',
]);

export const DEFAULT_SETTINGS: UserSettings = {
  cardFaceTheme: 'classic',
  cardBackTheme: 'spider-web',
  feltTheme: 'emerald',
  fourColorDeck: false,
  dimLockedCards: true,
  cameraPreset: 'classic-3d',
  cameraTiltDeg: 18,
  animationSpeed: 'normal',
  soundEnabled: true,
  soundVolume: 0.72,
  doubleClickAutoMove: true,
  leftHanded: false,
  autoCompletePrompt: true,
};

export const DEFAULT_STATS: PlayerStats = {
  currentWinStreak: 0,
  bestWinStreak: 0,
  totalGamesPlayed: 0,
  totalGamesWon: 0,
  byMode: {},
};

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const storage = globalThis.localStorage;
      if (storage && typeof storage.getItem === 'function') {
        return storage;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function readJson<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors.
  }
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON clone below.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isValidDeckCount(value: unknown): value is DeckCount {
  return value === 2 || value === 3 || value === 4;
}

function isValidSuitCount(value: unknown): value is SuitCount {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidGameState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const s = raw as Partial<GameState>;
  if (!s.config || typeof s.config !== 'object') {
    return false;
  }
  if (
    !isValidDeckCount(s.config.decks) ||
    !isValidSuitCount(s.config.suits) ||
    typeof s.config.winningDealOnly !== 'boolean' ||
    typeof s.config.relaxedStockDeal !== 'boolean' ||
    typeof s.config.seed !== 'number' ||
    !Number.isFinite(s.config.seed)
  ) {
    return false;
  }
  if (
    !Array.isArray(s.columns) ||
    s.columns.length === 0 ||
    !Array.isArray(s.stock) ||
    !Array.isArray(s.foundations) ||
    !Array.isArray(s.undoStack)
  ) {
    return false;
  }
  if (
    !isNonNegativeInt(s.moves) ||
    typeof s.score !== 'number' ||
    !Number.isFinite(s.score) ||
    !isNonNegativeInt(s.elapsedSeconds) ||
    typeof s.hasStarted !== 'boolean' ||
    typeof s.isWon !== 'boolean' ||
    !isNonNegativeInt(s.hintsUsed)
  ) {
    return false;
  }
  return true;
}

function emptyModeStats(): ModeStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    bestTimeSec: null,
    fewestMoves: null,
    highScore: null,
  };
}

function sanitizeModeStats(raw: unknown): ModeStats {
  if (!raw || typeof raw !== 'object') {
    return emptyModeStats();
  }
  const m = raw as Partial<ModeStats>;
  const gamesPlayed = isNonNegativeInt(m.gamesPlayed) ? Math.floor(m.gamesPlayed) : 0;
  const gamesWon = isNonNegativeInt(m.gamesWon) ? Math.floor(m.gamesWon) : 0;
  return {
    gamesPlayed: Math.max(gamesPlayed, gamesWon),
    gamesWon,
    bestTimeSec: isNonNegativeInt(m.bestTimeSec) ? Math.floor(m.bestTimeSec) : null,
    fewestMoves: isNonNegativeInt(m.fewestMoves) ? Math.floor(m.fewestMoves) : null,
    highScore:
      typeof m.highScore === 'number' && Number.isFinite(m.highScore)
        ? Math.round(m.highScore)
        : null,
  };
}

function cloneStats(stats: PlayerStats): PlayerStats {
  const byMode: Record<string, ModeStats> = {};
  for (const [key, value] of Object.entries(stats.byMode)) {
    byMode[key] = { ...value };
  }
  return {
    currentWinStreak: stats.currentWinStreak,
    bestWinStreak: stats.bestWinStreak,
    totalGamesPlayed: stats.totalGamesPlayed,
    totalGamesWon: stats.totalGamesWon,
    byMode,
  };
}

export function loadSettings(): UserSettings {
  const raw = readJson<Partial<UserSettings>>(KEYS.settings);
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    cardFaceTheme: VALID_CARD_FACE_THEMES.has(raw.cardFaceTheme as CardFaceTheme)
      ? (raw.cardFaceTheme as CardFaceTheme)
      : DEFAULT_SETTINGS.cardFaceTheme,
    cardBackTheme: VALID_CARD_BACK_THEMES.has(raw.cardBackTheme as CardBackTheme)
      ? (raw.cardBackTheme as CardBackTheme)
      : DEFAULT_SETTINGS.cardBackTheme,
    feltTheme: VALID_FELT_THEMES.has(raw.feltTheme as FeltTheme)
      ? (raw.feltTheme as FeltTheme)
      : DEFAULT_SETTINGS.feltTheme,
    fourColorDeck:
      typeof raw.fourColorDeck === 'boolean'
        ? raw.fourColorDeck
        : DEFAULT_SETTINGS.fourColorDeck,
    dimLockedCards:
      typeof raw.dimLockedCards === 'boolean'
        ? raw.dimLockedCards
        : DEFAULT_SETTINGS.dimLockedCards,
    cameraPreset: VALID_CAMERA_PRESETS.has(raw.cameraPreset as CameraPreset)
      ? (raw.cameraPreset as CameraPreset)
      : DEFAULT_SETTINGS.cameraPreset,
    cameraTiltDeg:
      typeof raw.cameraTiltDeg === 'number' && Number.isFinite(raw.cameraTiltDeg)
        ? clamp(Math.round(raw.cameraTiltDeg), 0, 28)
        : DEFAULT_SETTINGS.cameraTiltDeg,
    animationSpeed: VALID_ANIMATION_SPEEDS.has(raw.animationSpeed as AnimationSpeed)
      ? (raw.animationSpeed as AnimationSpeed)
      : DEFAULT_SETTINGS.animationSpeed,
    soundEnabled:
      typeof raw.soundEnabled === 'boolean'
        ? raw.soundEnabled
        : DEFAULT_SETTINGS.soundEnabled,
    soundVolume:
      typeof raw.soundVolume === 'number' && Number.isFinite(raw.soundVolume)
        ? clamp(raw.soundVolume, 0, 1)
        : DEFAULT_SETTINGS.soundVolume,
    doubleClickAutoMove:
      typeof raw.doubleClickAutoMove === 'boolean'
        ? raw.doubleClickAutoMove
        : DEFAULT_SETTINGS.doubleClickAutoMove,
    leftHanded:
      typeof raw.leftHanded === 'boolean' ? raw.leftHanded : DEFAULT_SETTINGS.leftHanded,
    autoCompletePrompt:
      typeof raw.autoCompletePrompt === 'boolean'
        ? raw.autoCompletePrompt
        : DEFAULT_SETTINGS.autoCompletePrompt,
  };
}

export function saveSettings(settings: UserSettings): void {
  const sanitized: UserSettings = {
    ...settings,
    cameraTiltDeg: clamp(Math.round(settings.cameraTiltDeg), 0, 28),
    soundVolume: clamp(settings.soundVolume, 0, 1),
  };
  writeJson(KEYS.settings, sanitized);
}

export function loadActiveGame(): GameState | null {
  const raw = readJson<unknown>(KEYS.activeGame);
  if (!isValidGameState(raw)) {
    return null;
  }
  return cloneValue(raw);
}

export function saveActiveGame(state: GameState): void {
  writeJson(KEYS.activeGame, state);
}

export function clearActiveGame(): void {
  removeKey(KEYS.activeGame);
}

export function loadStats(): PlayerStats {
  const raw = readJson<Partial<PlayerStats>>(KEYS.stats);
  if (!raw || typeof raw !== 'object') {
    return cloneStats(DEFAULT_STATS);
  }

  const byMode: Record<string, ModeStats> = {};
  if (raw.byMode && typeof raw.byMode === 'object') {
    for (const [key, val] of Object.entries(raw.byMode)) {
      byMode[key] = sanitizeModeStats(val);
    }
  }

  const totalGamesWon = isNonNegativeInt(raw.totalGamesWon)
    ? Math.floor(raw.totalGamesWon)
    : 0;
  const totalGamesPlayed = Math.max(
    totalGamesWon,
    isNonNegativeInt(raw.totalGamesPlayed) ? Math.floor(raw.totalGamesPlayed) : 0,
  );
  const currentWinStreak = isNonNegativeInt(raw.currentWinStreak)
    ? Math.floor(raw.currentWinStreak)
    : 0;
  const bestWinStreak = Math.max(
    currentWinStreak,
    isNonNegativeInt(raw.bestWinStreak) ? Math.floor(raw.bestWinStreak) : 0,
  );

  return {
    currentWinStreak,
    bestWinStreak,
    totalGamesPlayed,
    totalGamesWon,
    byMode,
  };
}

export function saveStats(stats: PlayerStats): void {
  writeJson(KEYS.stats, stats);
}

export function recordGameStarted(
  stats: PlayerStats,
  config: GameConfig | ResolvedGameConfig,
): PlayerStats {
  const next = cloneStats(stats);
  const modeKey = getModeKey(config.decks, config.suits);
  const prevMode = next.byMode[modeKey] ?? emptyModeStats();

  next.totalGamesPlayed += 1;
  next.byMode[modeKey] = {
    ...prevMode,
    gamesPlayed: prevMode.gamesPlayed + 1,
  };

  saveStats(next);
  return next;
}

export function recordGameWon(stats: PlayerStats, state: GameState): PlayerStats {
  const next = cloneStats(stats);
  const modeKey = getModeKey(state.config.decks, state.config.suits);
  const prevMode = next.byMode[modeKey] ?? emptyModeStats();

  const nextStreak = next.currentWinStreak + 1;
  next.currentWinStreak = nextStreak;
  next.bestWinStreak = Math.max(next.bestWinStreak, nextStreak);
  next.totalGamesWon += 1;
  next.totalGamesPlayed = Math.max(next.totalGamesPlayed, next.totalGamesWon);

  const nextModeWins = prevMode.gamesWon + 1;
  next.byMode[modeKey] = {
    gamesPlayed: Math.max(prevMode.gamesPlayed, nextModeWins),
    gamesWon: nextModeWins,
    bestTimeSec:
      prevMode.bestTimeSec === null
        ? state.elapsedSeconds
        : Math.min(prevMode.bestTimeSec, state.elapsedSeconds),
    fewestMoves:
      prevMode.fewestMoves === null
        ? state.moves
        : Math.min(prevMode.fewestMoves, state.moves),
    highScore:
      prevMode.highScore === null
        ? state.score
        : Math.max(prevMode.highScore, state.score),
  };

  saveStats(next);
  return next;
}

export function recordGameAbandoned(stats: PlayerStats): PlayerStats {
  const next = cloneStats(stats);
  next.currentWinStreak = 0;
  saveStats(next);
  return next;
}

export function loadSavedSlots(): SavedSlot[] {
  const raw = readJson<unknown>(KEYS.savedSlots);
  if (!Array.isArray(raw)) {
    return [];
  }

  const valid: SavedSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const slot = item as Partial<SavedSlot>;
    if (
      typeof slot.id === 'string' &&
      slot.id.length > 0 &&
      typeof slot.name === 'string' &&
      typeof slot.savedAt === 'number' &&
      Number.isFinite(slot.savedAt) &&
      isValidGameState(slot.state)
    ) {
      valid.push({
        id: slot.id,
        name: slot.name,
        savedAt: slot.savedAt,
        state: cloneValue(slot.state),
      });
    }
  }

  return valid.sort((a, b) => b.savedAt - a.savedAt);
}

export function saveSlot(name: string, state: GameState): SavedSlot[] {
  const existing = loadSavedSlots();
  const trimmed = name.trim();
  const fallbackName = `${state.config.decks}D · ${state.config.suits}S (Move ${state.moves})`;
  const slot: SavedSlot = {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed.length > 0 ? trimmed.slice(0, 60) : fallbackName,
    savedAt: Date.now(),
    state: cloneValue(state),
  };

  const next = [slot, ...existing].slice(0, MAX_SAVED_SLOTS);
  writeJson(KEYS.savedSlots, next);
  return next;
}

export function deleteSavedSlot(id: string): SavedSlot[] {
  const existing = loadSavedSlots();
  const next = existing.filter((slot) => slot.id !== id);
  writeJson(KEYS.savedSlots, next);
  return next;
}

export function loadUsedWinningSeeds(modeKey: string): number[] {
  const map = readJson<Record<string, unknown>>(KEYS.usedWinningSeeds);
  if (!map || typeof map !== 'object') {
    return [];
  }
  const list = map[modeKey];
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

export function markWinningSeedUsed(modeKey: string, seed: number): number[] {
  const rawMap = readJson<Record<string, unknown>>(KEYS.usedWinningSeeds);
  const map: Record<string, number[]> = {};

  if (rawMap && typeof rawMap === 'object') {
    for (const [k, v] of Object.entries(rawMap)) {
      if (Array.isArray(v)) {
        map[k] = v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      }
    }
  }

  const current = map[modeKey] ?? [];
  const deduped = current.filter((s) => s !== seed);
  deduped.push(seed);
  if (deduped.length > MAX_USED_SEEDS_PER_MODE) {
    deduped.splice(0, deduped.length - MAX_USED_SEEDS_PER_MODE);
  }

  map[modeKey] = deduped;
  writeJson(KEYS.usedWinningSeeds, map);
  return [...deduped];
}
