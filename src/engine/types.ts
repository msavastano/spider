export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type DeckCount = 2 | 3 | 4;
export type SuitCount = 1 | 2 | 3 | 4;

export interface Card {
  id: number;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface GameConfig {
  decks: DeckCount;
  suits: SuitCount;
  winningDealOnly: boolean;
  relaxedStockDeal: boolean;
  seed?: number;
}

export interface ResolvedGameConfig {
  decks: DeckCount;
  suits: SuitCount;
  winningDealOnly: boolean;
  relaxedStockDeal: boolean;
  seed: number;
}

export interface DeckLayoutSpec {
  decks: DeckCount;
  columns: number;
  stockDeals: number;
  foundationSlots: number;
  initialPerColumn: number[];
  totalCards: number;
}

export interface CompletedSuitRecord {
  fromCol: number;
  foundationIndex: number;
  suit: Suit;
  cardIds: number[];
  flippedAfterCompleteId: number | null;
}

export type MoveAction =
  | {
      type: 'move';
      fromCol: number;
      fromIndex: number;
      toCol: number;
      cardIds: number[];
      flippedCardId: number | null;
      completedSuit: CompletedSuitRecord | null;
    }
  | {
      type: 'deal';
      dealtCardIds: number[];
      completedSuits: CompletedSuitRecord[];
    };

export interface UndoEntry {
  action: MoveAction;
  prevScore: number;
  prevLastMoveSignature?: string;
}

export interface FoundationPile {
  suit: Suit;
  cards: Card[];
  completedAtMove: number;
}

export interface GameState {
  config: ResolvedGameConfig;
  columns: Card[][];
  stock: Card[][];
  foundations: FoundationPile[];
  moves: number;
  score: number;
  elapsedSeconds: number;
  hasStarted: boolean;
  isWon: boolean;
  hintsUsed: number;
  undoStack: UndoEntry[];
  lastMoveSignature?: string;
}

export type HintCategory =
  | 'complete-suit'
  | 'reveal-and-merge'
  | 'same-suit-merge'
  | 'reveal-card'
  | 'empty-column'
  | 'unlock-play'
  | 'tactical-shift'
  | 'deal-stock';

export type HintMove =
  | {
      kind: 'move';
      fromCol: number;
      fromIndex: number;
      toCol: number;
      cardIds: number[];
      score: number;
      category: HintCategory;
      reason: string;
    }
  | {
      kind: 'deal';
      score: number;
      category: 'deal-stock';
      reason: string;
    };

export interface TargetDestination {
  toCol: number;
  isSameSuit: boolean;
  isEmpty: boolean;
  wouldCompleteSuit: boolean;
  wouldRevealCard: boolean;
  score: number;
}

export type CardFaceTheme = 'classic' | 'jumbo' | 'modern' | 'midnight';
export type CardBackTheme =
  | 'spider-web'
  | 'royal-crimson'
  | 'emerald-guild'
  | 'celestial-gold'
  | 'minimal-slate';
export type FeltTheme = 'emerald' | 'sapphire' | 'burgundy' | 'obsidian' | 'mahogany';
export type CameraPreset = 'overhead' | 'classic-3d' | 'custom';
export type AnimationSpeed = 'relaxed' | 'normal' | 'snappy';

export interface UserSettings {
  cardFaceTheme: CardFaceTheme;
  cardBackTheme: CardBackTheme;
  feltTheme: FeltTheme;
  fourColorDeck: boolean;
  dimLockedCards: boolean;
  cameraPreset: CameraPreset;
  cameraTiltDeg: number;
  animationSpeed: AnimationSpeed;
  soundEnabled: boolean;
  soundVolume: number;
  doubleClickAutoMove: boolean;
  leftHanded: boolean;
  autoCompletePrompt: boolean;
}

export interface ModeStats {
  gamesPlayed: number;
  gamesWon: number;
  bestTimeSec: number | null;
  fewestMoves: number | null;
  highScore: number | null;
}

export interface PlayerStats {
  currentWinStreak: number;
  bestWinStreak: number;
  totalGamesPlayed: number;
  totalGamesWon: number;
  byMode: Record<string, ModeStats>;
}

export interface SavedSlot {
  id: string;
  name: string;
  savedAt: number;
  state: GameState;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const RANK_LABELS: Record<Rank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export function getDeckLayoutSpec(decks: DeckCount): DeckLayoutSpec {
  if (decks === 2) {
    return {
      decks: 2,
      columns: 10,
      stockDeals: 5,
      foundationSlots: 8,
      initialPerColumn: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5],
      totalCards: 104,
    };
  }
  if (decks === 3) {
    return {
      decks: 3,
      columns: 12,
      stockDeals: 7,
      foundationSlots: 12,
      initialPerColumn: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      totalCards: 156,
    };
  }
  return {
    decks: 4,
    columns: 16,
    stockDeals: 7,
    foundationSlots: 16,
    initialPerColumn: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    totalCards: 208,
  };
}

export function getModeKey(decks: DeckCount, suits: SuitCount): string {
  return `${decks}d-${suits}s`;
}
