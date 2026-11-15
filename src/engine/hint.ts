import {
  canDealStock,
  canPlaceRunOnColumn,
  executeMove,
  getMovableStartIndex,
  makeMoveSignature,
} from './rules';
import { type Card, type GameState, type HintCategory, type HintMove } from './types';

function countFaceDown(column: Card[]): number {
  let count = 0;
  for (let i = 0; i < column.length; i++) {
    if (!column[i].faceUp) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function wouldMoveCompleteSuit(
  srcCol: Card[],
  fromIndex: number,
  destCol: Card[]
): boolean {
  if (destCol.length === 0) return false;
  const movingCard = srcCol[fromIndex];
  const bottomCard = srcCol[srcCol.length - 1];
  if (bottomCard.rank !== 1) return false;
  const destTop = destCol[destCol.length - 1];
  if (destTop.suit !== movingCard.suit || destTop.rank !== movingCard.rank + 1) {
    return false;
  }
  const destRunStart = getMovableStartIndex(destCol);
  return destRunStart < destCol.length && destCol[destRunStart].rank === 13;
}

function evaluateTwoPlyUnlock(
  state: GameState,
  fromCol: number,
  fromIndex: number,
  toCol: number
): number {
  const ply1 = executeMove(state, fromCol, fromIndex, toCol);
  if (!ply1) return 0;

  const nextState = ply1.nextState;
  const nextFromCol = nextState.columns[fromCol];
  if (nextFromCol.length === 0) return 0;

  const exposedBottom = nextFromCol[nextFromCol.length - 1];
  if (!exposedBottom.faceUp) return 0;

  const exposedStart = getMovableStartIndex(nextFromCol);
  const exposedMovingCard = nextFromCol[exposedStart];
  const exposedWouldReveal = exposedStart > 0 && !nextFromCol[exposedStart - 1].faceUp;

  let bestGain = 0;

  // Direction 1: newly exposed run in fromCol can immediately make a high-value move
  for (let ply2To = 0; ply2To < nextState.columns.length; ply2To++) {
    if (ply2To === fromCol) continue;
    const ply2Dest = nextState.columns[ply2To];
    if (!canPlaceRunOnColumn(exposedMovingCard, ply2Dest)) continue;

    if (wouldMoveCompleteSuit(nextFromCol, exposedStart, ply2Dest)) {
      bestGain = Math.max(bestGain, 800);
    } else if (exposedWouldReveal) {
      bestGain = Math.max(bestGain, 500);
    } else if (
      ply2Dest.length > 0 &&
      ply2Dest[ply2Dest.length - 1].suit === exposedMovingCard.suit
    ) {
      bestGain = Math.max(bestGain, exposedStart === 0 ? 450 : 300);
    }
  }

  // Direction 2: another column's movable run can immediately same-suit merge or complete onto exposedBottom
  for (let otherCol = 0; otherCol < nextState.columns.length; otherCol++) {
    if (otherCol === fromCol || otherCol === toCol) continue;
    const srcOther = nextState.columns[otherCol];
    if (srcOther.length === 0) continue;

    const otherStart = getMovableStartIndex(srcOther);
    const otherMovingCard = srcOther[otherStart];
    if (
      otherMovingCard.suit === exposedBottom.suit &&
      exposedBottom.rank === otherMovingCard.rank + 1
    ) {
      if (wouldMoveCompleteSuit(srcOther, otherStart, nextFromCol)) {
        bestGain = Math.max(bestGain, 800);
      } else if (otherStart > 0 && !srcOther[otherStart - 1].faceUp) {
        bestGain = Math.max(bestGain, 500);
      } else {
        bestGain = Math.max(bestGain, otherStart === 0 ? 450 : 300);
      }
    }
  }

  return bestGain;
}

function buildFillEmptyHints(state: GameState, firstEmptyCol: number): HintMove[] {
  const candidates: Array<HintMove & { isReversal: boolean }> = [];

  for (let fromCol = 0; fromCol < state.columns.length; fromCol++) {
    const srcCol = state.columns[fromCol];
    if (srcCol.length < 2) continue;

    const movableStart = getMovableStartIndex(srcCol);
    // Prefer moving the full unbroken bottom run if movableStart >= 1 (does not split same-suit run)
    // Otherwise minimally split the tail card (srcCol.length - 1) so we fill the empty column without emptying srcCol.
    const chosenIndex = movableStart >= 1 ? movableStart : srcCol.length - 1;
    const isSplit = chosenIndex > movableStart;
    const movingCards = srcCol.slice(chosenIndex);
    const cardIds = movingCards.map((c) => c.id);
    const reverseSig = makeMoveSignature(firstEmptyCol, fromCol, cardIds);
    const isReversal = state.lastMoveSignature === reverseSig;

    const score =
      500 +
      (isSplit ? -200 : 150) +
      (chosenIndex > 0 && !srcCol[chosenIndex - 1].faceUp ? 100 : 0) +
      srcCol.length * 5 -
      movingCards.length * 2;

    candidates.push({
      kind: 'move',
      fromCol,
      fromIndex: chosenIndex,
      toCol: firstEmptyCol,
      cardIds,
      score,
      category: 'tactical-shift',
      reason: 'Move cards into empty column to allow dealing from stock',
      isReversal,
    });
  }

  const nonReversal = candidates.filter((c) => !c.isReversal);
  const chosen = nonReversal.length > 0 ? nonReversal : candidates;

  chosen.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.kind === 'move' && b.kind === 'move') {
      if (a.fromCol !== b.fromCol) return a.fromCol - b.fromCol;
      return a.fromIndex - b.fromIndex;
    }
    return 0;
  });

  return chosen.map(({ isReversal: _ignored, ...hint }) => hint);
}

function sortMoveHints(hints: HintMove[]): HintMove[] {
  return hints.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.kind === 'move' && b.kind === 'move') {
      if (a.fromCol !== b.fromCol) return a.fromCol - b.fromCol;
      if (a.fromIndex !== b.fromIndex) return a.fromIndex - b.fromIndex;
      return a.toCol - b.toCol;
    }
    return 0;
  });
}

export function getMeaningfulHints(state: GameState): HintMove[] {
  if (state.isWon) {
    return [];
  }

  let firstEmptyCol = -1;
  for (let i = 0; i < state.columns.length; i++) {
    if (state.columns[i].length === 0) {
      firstEmptyCol = i;
      break;
    }
  }

  const lastEntry =
    state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1] : undefined;
  const lastMoveFlippedCard =
    lastEntry?.action.type === 'move' && lastEntry.action.flippedCardId !== null;

  const meaningfulHints: HintMove[] = [];
  const reversalHints: HintMove[] = [];

  for (let fromCol = 0; fromCol < state.columns.length; fromCol++) {
    const srcCol = state.columns[fromCol];
    if (srcCol.length === 0) continue;

    const movableStart = getMovableStartIndex(srcCol);
    if (movableStart >= srcCol.length) continue;

    const srcFaceDownCount = countFaceDown(srcCol);

    for (let fromIndex = movableStart; fromIndex < srcCol.length; fromIndex++) {
      const movingCard = srcCol[fromIndex];
      const movingLen = srcCol.length - fromIndex;
      const isSplittingRun = fromIndex > movableStart;
      const srcAboveRunLen = fromIndex - movableStart;
      const wouldRevealCard = fromIndex > 0 && !srcCol[fromIndex - 1].faceUp;
      const wouldEmptyCol = fromIndex === 0 && srcCol[0].faceUp;
      const movingIds = srcCol.slice(fromIndex).map((c) => c.id);

      for (let toCol = 0; toCol < state.columns.length; toCol++) {
        if (toCol === fromCol) continue;
        const destCol = state.columns[toCol];
        const isEmpty = destCol.length === 0;

        // Deduplicate empty columns to one representative empty column
        if (isEmpty && toCol !== firstEmptyCol) {
          continue;
        }

        if (!canPlaceRunOnColumn(movingCard, destCol)) {
          continue;
        }

        // Never slide an entire exposed single-run column into an empty column
        if (wouldEmptyCol && isEmpty) {
          continue;
        }

        const isSameSuit = !isEmpty && destCol[destCol.length - 1].suit === movingCard.suit;
        const destRunStart = isEmpty ? 0 : getMovableStartIndex(destCol);
        const destRunLen = isEmpty ? 0 : destCol.length - destRunStart;
        const completesSuit = wouldMoveCompleteSuit(srcCol, fromIndex, destCol);

        // Never split an unbroken same-suit run unless placing onto a same-suit parent
        // whose existing same-suit run above is strictly longer, or directly completing K..A.
        if (isSplittingRun) {
          if (!completesSuit && !(isSameSuit && destRunLen > srcAboveRunLen)) {
            continue;
          }
        }

        let category: HintCategory | null = null;
        let score = 0;
        let reason = '';

        if (completesSuit) {
          category = 'complete-suit';
          score =
            10000 +
            (wouldRevealCard ? 300 : 0) +
            (wouldEmptyCol ? 200 : 0) +
            (isSplittingRun ? -50 : 0) +
            movingLen;
          reason = 'Complete full K–A suit run';
        } else if (isSameSuit && wouldRevealCard) {
          category = 'reveal-and-merge';
          score = 8000 + destRunLen * 25 + movingLen * 5;
          reason = 'Reveal face-down card and build same-suit run';
        } else if (isSameSuit) {
          category = 'same-suit-merge';
          score =
            6000 +
            (wouldEmptyCol ? 500 : 0) +
            destRunLen * 25 +
            movingLen * 5 +
            (isSplittingRun ? -150 : 0);
          reason = wouldEmptyCol
            ? 'Merge same-suit run and clear column'
            : 'Merge onto same-suit run';
        } else if (wouldRevealCard) {
          category = 'reveal-card';
          score =
            4000 +
            (isEmpty ? 0 : 300) +
            Math.max(0, 15 - srcFaceDownCount) * 10 +
            movingLen * 5;
          reason = isEmpty
            ? 'Move to empty column to reveal face-down card'
            : 'Move run to reveal face-down card';
        } else if (wouldEmptyCol && !isEmpty) {
          category = 'empty-column';
          score = 3000 + destRunLen * 10 - movingLen * 2;
          reason = 'Clear column to create an empty workspace';
        } else {
          // Moving onto a different suit or empty column without directly flipping or emptying:
          // Only suggest if 2-ply lookahead confirms the newly exposed card immediately unlocks
          // a suit completion, face-down card flip, or same-suit merge.
          const unlockGain = evaluateTwoPlyUnlock(state, fromCol, fromIndex, toCol);
          if (unlockGain > 0) {
            category = 'unlock-play';
            score = 2000 + unlockGain + (isEmpty ? 0 : 200);
            reason = 'Shift run to unlock a same-suit merge or card flip';
          }
        }

        if (!category) {
          continue;
        }

        const reverseSig = makeMoveSignature(toCol, fromCol, movingIds);
        const isReversal = state.lastMoveSignature === reverseSig;

        const hint: HintMove = {
          kind: 'move',
          fromCol,
          fromIndex,
          toCol,
          cardIds: movingIds,
          score,
          category,
          reason,
        };

        if (
          isReversal &&
          !(
            lastMoveFlippedCard &&
            (category === 'complete-suit' ||
              category === 'reveal-and-merge' ||
              category === 'same-suit-merge')
          )
        ) {
          reversalHints.push(hint);
        } else {
          meaningfulHints.push(hint);
        }
      }
    }
  }

  if (meaningfulHints.length > 0) {
    return sortMoveHints(meaningfulHints);
  }

  if (canDealStock(state)) {
    return [
      {
        kind: 'deal',
        score: 100,
        category: 'deal-stock',
        reason: 'Deal a new row of cards from the stock',
      },
    ];
  }

  if (state.stock.length > 0 && !state.config.relaxedStockDeal && firstEmptyCol !== -1) {
    const fillHints = buildFillEmptyHints(state, firstEmptyCol);
    if (fillHints.length > 0) {
      return fillHints;
    }
  }

  if (reversalHints.length > 0) {
    return sortMoveHints(reversalHints);
  }

  return [];
}
