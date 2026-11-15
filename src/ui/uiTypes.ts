import type {
  DeckCount,
  GameConfig,
  GameState,
  PlayerStats,
  SavedSlot,
  SuitCount,
  UserSettings,
} from '../engine/types';

export interface AppActions {
  onNewGame: (config: GameConfig, forceAbandonStreak?: boolean) => void;
  onReplayDeal: () => void;
  onUndo: () => void;
  onHint: () => void;
  onDealStock: () => void;
  onAutoComplete: () => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onResetStats: () => void;
  onSaveSlot: (name: string) => void;
  onLoadSlot: (id: string) => void;
  onDeleteSlot: (id: string) => void;
  onPauseToggle: (paused: boolean) => void;
}

export interface HudSnapshot {
  state: GameState;
  stats: PlayerStats;
  settings: UserSettings;
  canUndo: boolean;
  canDealStock: boolean;
  canAutoComplete: boolean;
  hintCounter: { index: number; total: number; label: string } | null;
  findingWinningDeal: boolean;
}

export type ModalKind =
  | 'none'
  | 'new-game'
  | 'customize'
  | 'stats'
  | 'saves'
  | 'help'
  | 'victory'
  | 'abandon-confirm';

export interface PendingNewGamePrompt {
  config: GameConfig;
  currentStreak: number;
}

export interface NewGameOptionPreset {
  decks: DeckCount;
  suits: SuitCount;
  label: string;
  difficulty: string;
}

export interface UIStateSnapshot {
  activeModal: ModalKind;
  pendingAbandon: PendingNewGamePrompt | null;
  savedSlots: SavedSlot[];
  toastMessage: string | null;
}
