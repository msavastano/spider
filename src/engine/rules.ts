import {
  type Card,
  type CompletedSuitRecord,
  type DeckCount,
  type FoundationPile,
  type GameState,
  type MoveAction,
  type Rank,
  type ResolvedGameConfig,
  type Suit,
  type SuitCount,
  type TargetDestination,
  type UndoEntry,
  getDeckLayoutSpec,
} from './types';

const SUIT_ORDER: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function getSuitDistribution(decks: DeckCount, suits: SuitCount): Suit[] {
  const totalSets = decks * 4;
  const dist: Suit[] = new Array(totalSets);
  for (let i = 0; i < totalSets; i++) {
    dist[i] = SUIT_ORDER[i % suits];
  }
  return dist;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dealFromSeed(config: ResolvedGameConfig): GameState {
  const spec = getDeckLayoutSpec(config.decks);
  const suitDist = getSuitDistribution(config.decks, config.suits);

  const deck: Card[] = [];
  let nextId = 0;
  for (const suit of suitDist) {
    for (let r = 1; r <= 13; r++) {
      deck.push({
        id: nextId++,
        suit,
        rank: r as Rank,
        faceUp: false,
      });
    }
  }

  const rng = createMulberry32(config.seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  let cursor = 0;
  const columns: Card[][] = new Array(spec.columns);
  for (let col = 0; col < spec.columns; col++) {
    const count = spec.initialPerColumn[col];
    const pile: Card[] = new Array(count);
    for (let row = 0; row < count; row++) {
      const card = deck[cursor++];
      card.faceUp = row === count - 1;
      pile[row] = card;
    }
    columns[col] = pile;
  }

  const stock: Card[][] = new Array(spec.stockDeals);
  for (let d = 0; d < spec.stockDeals; d++) {
    const batch: Card[] = new Array(spec.columns);
    for (let col = 0; col < spec.columns; col++) {
      const card = deck[cursor++];
      card.faceUp = false;
      batch[col] = card;
    }
    stock[d] = batch;
  }

  return {
    config: { ...config },
    columns,
    stock,
    foundations: [],
    moves: 0,
    score: 500,
    elapsedSeconds: 0,
    hasStarted: false,
    isWon: false,
    hintsUsed: 0,
    undoStack: [],
    lastMoveSignature: undefined,
  };
}

function cloneCard(c: Card): Card {
  return { id: c.id, suit: c.suit, rank: c.rank, faceUp: c.faceUp };
}

function cloneCompletedSuitRecord(r: CompletedSuitRecord): CompletedSuitRecord {
  return {
    fromCol: r.fromCol,
    foundationIndex: r.foundationIndex,
    suit: r.suit,
    cardIds: [...r.cardIds],
    flippedAfterCompleteId: r.flippedAfterCompleteId,
  };
}

function cloneMoveAction(action: MoveAction): MoveAction {
  if (action.type === 'move') {
    return {
      type: 'move',
      fromCol: action.fromCol,
      fromIndex: action.fromIndex,
      toCol: action.toCol,
      cardIds: [...action.cardIds],
      flippedCardId: action.flippedCardId,
      completedSuit: action.completedSuit ? cloneCompletedSuitRecord(action.completedSuit) : null,
    };
  }
  return {
    type: 'deal',
    dealtCardIds: [...action.dealtCardIds],
    completedSuits: action.completedSuits.map(cloneCompletedSuitRecord),
  };
}

export function cloneGameState(state: GameState): GameState {
  return {
    config: { ...state.config },
    columns: state.columns.map((col) => col.map(cloneCard)),
    stock: state.stock.map((batch) => batch.map(cloneCard)),
    foundations: state.foundations.map(
      (f): FoundationPile => ({
        suit: f.suit,
        cards: f.cards.map(cloneCard),
        completedAtMove: f.completedAtMove,
      })
    ),
    moves: state.moves,
    score: state.score,
    elapsedSeconds: state.elapsedSeconds,
    hasStarted: state.hasStarted,
    isWon: state.isWon,
    hintsUsed: state.hintsUsed,
    undoStack: state.undoStack.map(
      (u): UndoEntry => ({
        action: cloneMoveAction(u.action),
        prevScore: u.prevScore,
        prevLastMoveSignature: u.prevLastMoveSignature,
      })
    ),
    lastMoveSignature: state.lastMoveSignature,
  };
}

export function isMovableRun(column: Card[], fromIndex: number): boolean {
  if (fromIndex < 0 || fromIndex >= column.length) {
    return false;
  }
  if (!column[fromIndex].faceUp) {
    return false;
  }
  for (let i = fromIndex; i < column.length - 1; i++) {
    const upper = column[i];
    const lower = column[i + 1];
    if (!lower.faceUp || upper.suit !== lower.suit || upper.rank !== lower.rank + 1) {
      return false;
    }
  }
  return true;
}

export function getMovableStartIndex(column: Card[]): number {
  if (column.length === 0) {
    return 0;
  }
  let idx = column.length - 1;
  if (!column[idx].faceUp) {
    return column.length;
  }
  while (idx > 0) {
    const upper = column[idx - 1];
    const lower = column[idx];
    if (!upper.faceUp || upper.suit !== lower.suit || upper.rank !== lower.rank + 1) {
      break;
    }
    idx--;
  }
  return idx;
}

export function canPlaceRunOnColumn(movingCard: Card, destColumn: Card[]): boolean {
  if (destColumn.length === 0) {
    return true;
  }
  const top = destColumn[destColumn.length - 1];
  return top.faceUp && top.rank === movingCard.rank + 1;
}

export function getValidDestinations(
  state: GameState,
  fromCol: number,
  fromIndex: number
): TargetDestination[] {
  if (fromCol < 0 || fromCol >= state.columns.length) {
    return [];
  }
  const srcCol = state.columns[fromCol];
  if (!isMovableRun(srcCol, fromIndex)) {
    return [];
  }

  const movingCard = srcCol[fromIndex];
  const bottomCard = srcCol[srcCol.length - 1];
  const wouldRevealCard = fromIndex > 0 && !srcCol[fromIndex - 1].faceUp;
  const destinations: TargetDestination[] = [];

  for (let toCol = 0; toCol < state.columns.length; toCol++) {
    if (toCol === fromCol) continue;
    const destCol = state.columns[toCol];
    if (!canPlaceRunOnColumn(movingCard, destCol)) continue;

    const isEmpty = destCol.length === 0;
    const isSameSuit = !isEmpty && destCol[destCol.length - 1].suit === movingCard.suit;

    let destSameSuitLen = 0;
    let wouldCompleteSuit = false;
    if (!isEmpty) {
      const destRunStart = getMovableStartIndex(destCol);
      destSameSuitLen = destCol.length - destRunStart;
      if (
        isSameSuit &&
        bottomCard.rank === 1 &&
        destSameSuitLen > 0 &&
        destCol[destRunStart].rank === 13
      ) {
        wouldCompleteSuit = true;
      }
    }

    let score = 0;
    if (wouldCompleteSuit) {
      score = 10000 + destSameSuitLen * 20;
    } else if (isSameSuit) {
      score = 5000 + destSameSuitLen * 20;
    } else if (!isEmpty) {
      score = 1000 + destSameSuitLen * 5;
    } else {
      score = 100;
    }

    if (wouldRevealCard) {
      score += 200;
    }
    if (fromIndex === 0 && !isEmpty) {
      score += 150;
    }

    destinations.push({
      toCol,
      isSameSuit,
      isEmpty,
      wouldCompleteSuit,
      wouldRevealCard,
      score,
    });
  }

  destinations.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.toCol - b.toCol;
  });

  return destinations;
}

function checkAndExtractCompletedSuit(
  columns: Card[][],
  foundations: FoundationPile[],
  colIndex: number,
  atMove: number
): CompletedSuitRecord | null {
  const col = columns[colIndex];
  if (col.length < 13) {
    return null;
  }

  const startIdx = col.length - 13;
  const suit = col[startIdx].suit;
  for (let offset = 0; offset < 13; offset++) {
    const card = col[startIdx + offset];
    if (!card.faceUp || card.suit !== suit || card.rank !== 13 - offset) {
      return null;
    }
  }

  const removed = col.splice(startIdx, 13);
  const foundationIndex = foundations.length;
  foundations.push({
    suit,
    cards: removed,
    completedAtMove: atMove,
  });

  let flippedAfterCompleteId: number | null = null;
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
    flippedAfterCompleteId = col[col.length - 1].id;
  }

  return {
    fromCol: colIndex,
    foundationIndex,
    suit,
    cardIds: removed.map((c) => c.id),
    flippedAfterCompleteId,
  };
}

export function makeMoveSignature(fromCol: number, toCol: number, cardIds: number[]): string {
  return `${fromCol}->${toCol}:${cardIds.join(',')}`;
}

export function executeMove(
  state: GameState,
  fromCol: number,
  fromIndex: number,
  toCol: number
): { nextState: GameState; action: MoveAction } | null {
  if (state.isWon) {
    return null;
  }
  if (
    fromCol === toCol ||
    fromCol < 0 ||
    fromCol >= state.columns.length ||
    toCol < 0 ||
    toCol >= state.columns.length
  ) {
    return null;
  }

  const origSrc = state.columns[fromCol];
  if (!isMovableRun(origSrc, fromIndex)) {
    return null;
  }
  if (!canPlaceRunOnColumn(origSrc[fromIndex], state.columns[toCol])) {
    return null;
  }

  const nextState = cloneGameState(state);
  const srcCol = nextState.columns[fromCol];
  const destCol = nextState.columns[toCol];

  const movingCards = srcCol.splice(fromIndex);
  const cardIds = movingCards.map((c) => c.id);
  destCol.push(...movingCards);

  let flippedCardId: number | null = null;
  if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp) {
    srcCol[srcCol.length - 1].faceUp = true;
    flippedCardId = srcCol[srcCol.length - 1].id;
  }

  const nextMoves = state.moves + 1;
  const completedSuit = checkAndExtractCompletedSuit(
    nextState.columns,
    nextState.foundations,
    toCol,
    nextMoves
  );

  const action: MoveAction = {
    type: 'move',
    fromCol,
    fromIndex,
    toCol,
    cardIds,
    flippedCardId,
    completedSuit,
  };

  nextState.undoStack.push({
    action,
    prevScore: state.score,
    prevLastMoveSignature: state.lastMoveSignature,
  });

  nextState.moves = nextMoves;
  nextState.score = Math.max(0, state.score - 1) + (completedSuit ? 100 : 0);
  nextState.hasStarted = true;
  nextState.lastMoveSignature = makeMoveSignature(fromCol, toCol, cardIds);
  nextState.isWon =
    nextState.foundations.length === getDeckLayoutSpec(nextState.config.decks).foundationSlots;

  return { nextState, action };
}

export function canDealStock(state: GameState): boolean {
  if (state.isWon || state.stock.length === 0) {
    return false;
  }
  if (!state.config.relaxedStockDeal) {
    for (let i = 0; i < state.columns.length; i++) {
      if (state.columns[i].length === 0) {
        return false;
      }
    }
  }
  return true;
}

export function dealFromStock(
  state: GameState
): { nextState: GameState; action: MoveAction } | null {
  if (!canDealStock(state)) {
    return null;
  }

  const nextState = cloneGameState(state);
  const batch = nextState.stock.pop()!;
  const nextMoves = state.moves + 1;
  const dealtCardIds: number[] = [];
  const completedSuits: CompletedSuitRecord[] = [];

  for (let col = 0; col < nextState.columns.length; col++) {
    const card = batch[col];
    card.faceUp = true;
    nextState.columns[col].push(card);
    dealtCardIds.push(card.id);

    const completed = checkAndExtractCompletedSuit(
      nextState.columns,
      nextState.foundations,
      col,
      nextMoves
    );
    if (completed) {
      completedSuits.push(completed);
    }
  }

  const action: MoveAction = {
    type: 'deal',
    dealtCardIds,
    completedSuits,
  };

  nextState.undoStack.push({
    action,
    prevScore: state.score,
    prevLastMoveSignature: state.lastMoveSignature,
  });

  nextState.moves = nextMoves;
  nextState.score = Math.max(0, state.score - 1) + completedSuits.length * 100;
  nextState.hasStarted = true;
  nextState.lastMoveSignature = undefined;
  nextState.isWon =
    nextState.foundations.length === getDeckLayoutSpec(nextState.config.decks).foundationSlots;

  return { nextState, action };
}

function restoreCompletedSuit(
  state: GameState,
  cs: CompletedSuitRecord
): void {
  if (cs.flippedAfterCompleteId !== null) {
    const col = state.columns[cs.fromCol];
    if (col.length > 0 && col[col.length - 1].id === cs.flippedAfterCompleteId) {
      col[col.length - 1].faceUp = false;
    }
  }
  const pile = state.foundations.pop();
  if (pile) {
    state.columns[cs.fromCol].push(...pile.cards);
  }
}

export function undoMove(
  state: GameState
): { nextState: GameState; undoneAction: MoveAction } | null {
  if (state.undoStack.length === 0) {
    return null;
  }

  const nextState = cloneGameState(state);
  const entry = nextState.undoStack.pop()!;
  const undoneAction = entry.action;

  if (undoneAction.type === 'move') {
    if (undoneAction.completedSuit) {
      restoreCompletedSuit(nextState, undoneAction.completedSuit);
    }

    if (undoneAction.flippedCardId !== null) {
      const srcCol = nextState.columns[undoneAction.fromCol];
      if (srcCol.length > 0 && srcCol[srcCol.length - 1].id === undoneAction.flippedCardId) {
        srcCol[srcCol.length - 1].faceUp = false;
      }
    }

    const destCol = nextState.columns[undoneAction.toCol];
    const movedCards = destCol.splice(destCol.length - undoneAction.cardIds.length);
    nextState.columns[undoneAction.fromCol].push(...movedCards);
  } else {
    for (let i = undoneAction.completedSuits.length - 1; i >= 0; i--) {
      restoreCompletedSuit(nextState, undoneAction.completedSuits[i]);
    }

    const batch: Card[] = new Array(nextState.columns.length);
    for (let col = 0; col < nextState.columns.length; col++) {
      const card = nextState.columns[col].pop()!;
      card.faceUp = false;
      batch[col] = card;
    }
    nextState.stock.push(batch);
  }

  nextState.moves = Math.max(0, state.moves - 1);
  nextState.score = entry.prevScore;
  nextState.lastMoveSignature = entry.prevLastMoveSignature;
  nextState.isWon = false;

  return { nextState, undoneAction };
}

export function isAutoCompletable(state: GameState): boolean {
  if (state.isWon || state.stock.length > 0) {
    return false;
  }
  let hasCards = false;
  for (let colIdx = 0; colIdx < state.columns.length; colIdx++) {
    const col = state.columns[colIdx];
    if (col.length === 0) continue;
    hasCards = true;
    if (!col[0].faceUp) {
      return false;
    }
    if (getMovableStartIndex(col) !== 0) {
      return false;
    }
  }
  return hasCards;
}

export function getAutoCompleteStep(
  state: GameState
): { fromCol: number; fromIndex: number; toCol: number } | null {
  if (!isAutoCompletable(state)) {
    return null;
  }

  let bestStep: { fromCol: number; fromIndex: number; toCol: number; score: number } | null = null;

  for (let fromCol = 0; fromCol < state.columns.length; fromCol++) {
    const srcCol = state.columns[fromCol];
    if (srcCol.length === 0) continue;

    const movingCard = srcCol[0];
    const bottomCard = srcCol[srcCol.length - 1];

    for (let toCol = 0; toCol < state.columns.length; toCol++) {
      if (toCol === fromCol) continue;
      const destCol = state.columns[toCol];
      if (destCol.length === 0) continue;

      const destTop = destCol[destCol.length - 1];
      if (destTop.suit !== movingCard.suit || destTop.rank !== movingCard.rank + 1) {
        continue;
      }

      const completesSuit = destCol[0].rank === 13 && bottomCard.rank === 1;
      const score =
        (completesSuit ? 10000 : 0) +
        destCol[0].rank * 50 +
        destCol.length * 10 +
        srcCol.length;

      if (!bestStep || score > bestStep.score) {
        bestStep = { fromCol, fromIndex: 0, toCol, score };
      }
    }
  }

  if (!bestStep) {
    return null;
  }
  return {
    fromCol: bestStep.fromCol,
    fromIndex: bestStep.fromIndex,
    toCol: bestStep.toCol,
  };
}
