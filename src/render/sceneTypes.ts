import type {
  GameState,
  HintMove,
  MoveAction,
  TargetDestination,
  UserSettings,
} from '../engine/types';

export interface SceneCallbacks {
  onCardClick: (col: number, index: number) => void;
  onCardDoubleClick: (col: number, index: number) => void;
  onAttemptMove: (fromCol: number, fromIndex: number, toCol: number) => void;
  onDestinationClick: (toCol: number) => void;
  onEmptySpaceClick: () => void;
  onStockClick: () => void;
  onAnimationEvent?: (event: SceneSoundEvent) => void;
}

export type SceneSoundEvent =
  | 'pickup'
  | 'place'
  | 'flip'
  | 'deal'
  | 'complete-suit'
  | 'blocked'
  | 'undo';

export interface SelectionHighlight {
  fromCol: number;
  fromIndex: number;
  destinations: TargetDestination[];
}

export interface SpiderSceneController {
  mount(container: HTMLElement): void;
  dispose(): void;
  applySettings(settings: UserSettings): void;
  syncState(state: GameState, lastAction?: MoveAction | 'deal-new' | 'undo' | 'restore', prevAction?: MoveAction): void;
  showHint(hint: HintMove, hintIndex: number, totalHints: number): void;
  clearHint(): void;
  showSelectionTargets(selection: SelectionHighlight | null): void;
  pulseLockedCard(col: number, index: number): void;
  startWinCelebration(state: GameState): void;
  stopWinCelebration(): void;
  resize(): void;
}
