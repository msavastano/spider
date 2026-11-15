import {
  type Card,
  type GameState,
  type Suit,
  getDeckLayoutSpec,
} from './types';

export interface SolveOptions {
  maxNodes?: number;
  beamWidth?: number;
}

export interface SolveResult {
  solvable: boolean;
  movesCount?: number;
  visitedNodes: number;
}

interface PackedState {
  cols: number[][];
  stockIdx: number;
  foundations: number;
  moves: number;
  score: number;
  hash: string;
}

const SUIT_INDEX: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

function packCard(c: Card): number {
  return (SUIT_INDEX[c.suit] << 5) | (c.rank << 1) | (c.faceUp ? 1 : 0);
}

function getSuit(v: number): number {
  return v >> 5;
}

function getRank(v: number): number {
  return (v >> 1) & 0x0f;
}

function isFaceUp(v: number): boolean {
  return (v & 1) !== 0;
}

function getMovableStartPacked(col: number[]): number {
  const len = col.length;
  if (len === 0) return 0;
  let idx = len - 1;
  if ((col[idx] & 1) === 0) return len;
  while (idx > 0) {
    const upper = col[idx - 1];
    const lower = col[idx];
    if (
      (upper & 1) === 0 ||
      upper >> 5 !== lower >> 5 ||
      ((upper >> 1) & 0x0f) !== ((lower >> 1) & 0x0f) + 1
    ) {
      break;
    }
    idx--;
  }
  return idx;
}

function checkAndRemoveCompletedSuitPacked(col: number[]): boolean {
  const len = col.length;
  if (len < 13) return false;
  const start = len - 13;
  const first = col[start];
  if ((first & 1) === 0 || ((first >> 1) & 0x0f) !== 13) return false;
  const suitPrefix = first >> 5;
  for (let k = 1; k < 13; k++) {
    const expected = (suitPrefix << 5) | ((13 - k) << 1) | 1;
    if (col[start + k] !== expected) {
      return false;
    }
  }
  col.length = start;
  if (col.length > 0 && (col[col.length - 1] & 1) === 0) {
    col[col.length - 1] |= 1;
  }
  return true;
}

function computeCanonicalHash(
  cols: number[][],
  stockIdx: number,
  foundations: number
): string {
  const parts: string[] = new Array(cols.length);
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (col.length === 0) {
      parts[i] = '';
    } else {
      let s = '';
      for (let j = 0; j < col.length; j++) {
        s += String.fromCharCode(col[j] + 1);
      }
      parts[i] = s;
    }
  }
  parts.sort();
  return `${stockIdx}|${foundations}|${parts.join('\0')}`;
}

function evaluateBoard(
  cols: number[][],
  foundations: number,
  stockIdx: number,
  moves: number
): number {
  let emptyCols = 0;
  let faceDownCount = 0;
  let colsWithFaceDown = 0;
  let score = foundations * 15000 - moves * 2;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const len = col.length;
    if (len === 0) {
      emptyCols++;
      continue;
    }

    let firstFaceUpIdx = len;
    for (let j = 0; j < len; j++) {
      if ((col[j] & 1) === 0) {
        faceDownCount++;
      } else {
        firstFaceUpIdx = j;
        break;
      }
    }
    if (firstFaceUpIdx > 0) {
      colsWithFaceDown++;
    }

    if (firstFaceUpIdx < len) {
      if (firstFaceUpIdx === 0) {
        const rootRank = getRank(col[0]);
        if (rootRank === 13) {
          score += 140;
        } else if (len === 1) {
          score += 35;
        }
      }

      let curRunLen = 1;
      for (let j = firstFaceUpIdx; j < len - 1; j++) {
        const upper = col[j];
        const lower = col[j + 1];
        const upperRank = (upper >> 1) & 0x0f;
        const lowerRank = (lower >> 1) & 0x0f;
        if (upper >> 5 === lower >> 5 && upperRank === lowerRank + 1) {
          curRunLen++;
          score += 120;
        } else {
          score += curRunLen * curRunLen * 20;
          curRunLen = 1;
          if (upperRank === lowerRank + 1) {
            score -= 25;
          } else {
            score -= 200;
          }
        }
      }
      score += curRunLen * curRunLen * 20;
    }
  }

  score -= faceDownCount * 700;
  score -= colsWithFaceDown * 180;

  if (emptyCols > 0) {
    if (stockIdx === 0) {
      score += 550 + (emptyCols - 1) * 350;
    } else {
      score += 450 + (emptyCols - 1) * 260;
    }
  }

  return score;
}

function isAutoCompletablePacked(
  cols: number[][],
  stockIdx: number,
  foundations: number,
  foundationSlots: number
): boolean {
  if (stockIdx > 0 || foundations >= foundationSlots) return false;
  let hasCards = false;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (col.length === 0) continue;
    hasCards = true;
    if ((col[0] & 1) === 0) return false;
    if (getMovableStartPacked(col) !== 0) return false;
  }
  return hasCards;
}

function countAutoCompleteMoves(
  initialCols: number[][],
  initialFoundations: number,
  initialMoves: number,
  foundationSlots: number
): number | null {
  const cols = initialCols.map((c) => c.slice());
  let foundations = initialFoundations;
  let moves = initialMoves;
  const maxSteps = cols.length * 4 + 48;

  for (let step = 0; step < maxSteps; step++) {
    if (foundations >= foundationSlots) {
      return moves;
    }

    let bestFrom = -1;
    let bestTo = -1;
    let bestScore = -1;

    for (let f = 0; f < cols.length; f++) {
      const src = cols[f];
      if (src.length === 0) continue;
      const moving = src[0];
      const movingSuit = moving >> 5;
      const movingRank = (moving >> 1) & 0x0f;
      const bottomRank = (src[src.length - 1] >> 1) & 0x0f;

      for (let t = 0; t < cols.length; t++) {
        if (t === f) continue;
        const dest = cols[t];
        if (dest.length === 0) continue;
        const destTop = dest[dest.length - 1];
        if (destTop >> 5 !== movingSuit || ((destTop >> 1) & 0x0f) !== movingRank + 1) {
          continue;
        }
        const completes = ((dest[0] >> 1) & 0x0f) === 13 && bottomRank === 1;
        const s =
          (completes ? 10000 : 0) +
          ((dest[0] >> 1) & 0x0f) * 50 +
          dest.length * 10 +
          src.length;
        if (s > bestScore) {
          bestScore = s;
          bestFrom = f;
          bestTo = t;
        }
      }
    }

    if (bestFrom === -1) {
      return null;
    }

    cols[bestTo].push(...cols[bestFrom]);
    cols[bestFrom].length = 0;
    moves++;
    if (checkAndRemoveCompletedSuitPacked(cols[bestTo])) {
      foundations++;
    }
  }

  return foundations >= foundationSlots ? moves : null;
}

function applyMovePacked(
  st: PackedState,
  fromCol: number,
  fromIndex: number,
  toCol: number
): PackedState {
  const cols = st.cols.slice();
  const src = st.cols[fromCol].slice(0, fromIndex);
  const moving = st.cols[fromCol].slice(fromIndex);
  const dest = st.cols[toCol].concat(moving);

  if (src.length > 0 && (src[src.length - 1] & 1) === 0) {
    src[src.length - 1] |= 1;
  }

  let foundations = st.foundations;
  if (checkAndRemoveCompletedSuitPacked(dest)) {
    foundations++;
  }

  cols[fromCol] = src;
  cols[toCol] = dest;

  const moves = st.moves + 1;
  return {
    cols,
    stockIdx: st.stockIdx,
    foundations,
    moves,
    score: evaluateBoard(cols, foundations, st.stockIdx, moves),
    hash: computeCanonicalHash(cols, st.stockIdx, foundations),
  };
}

function prepareStateForDeal(
  st: PackedState,
  relaxedStockDeal: boolean
): PackedState | null {
  if (relaxedStockDeal) return st;

  let emptyCount = 0;
  let totalCards = 0;
  for (let i = 0; i < st.cols.length; i++) {
    const len = st.cols[i].length;
    totalCards += len;
    if (len === 0) emptyCount++;
  }
  if (emptyCount === 0) return st;
  if (totalCards < st.cols.length) return null;

  let current = st;
  for (let fill = 0; fill < emptyCount; fill++) {
    let targetEmpty = -1;
    for (let i = 0; i < current.cols.length; i++) {
      if (current.cols[i].length === 0) {
        targetEmpty = i;
        break;
      }
    }
    if (targetEmpty === -1) break;

    let bestFrom = -1;
    let bestIdx = -1;
    let bestPickScore = -Infinity;

    for (let f = 0; f < current.cols.length; f++) {
      const col = current.cols[f];
      if (col.length < 2) continue;
      const mStart = getMovableStartPacked(col);
      const idx = mStart >= 1 ? mStart : col.length - 1;
      const isSplit = idx > mStart;
      const reveals = idx > 0 && (col[idx - 1] & 1) === 0;
      const pickScore =
        (isSplit ? -500 : 300) + (reveals ? 200 : 0) + col.length * 5 - (col.length - idx);
      if (pickScore > bestPickScore) {
        bestPickScore = pickScore;
        bestFrom = f;
        bestIdx = idx;
      }
    }

    if (bestFrom === -1) return null;
    current = applyMovePacked(current, bestFrom, bestIdx, targetEmpty);
  }

  return current;
}

function applyDealPacked(
  st: PackedState,
  stockBatches: number[][],
  relaxedStockDeal: boolean
): PackedState | null {
  if (st.stockIdx <= 0) return null;
  const ready = prepareStateForDeal(st, relaxedStockDeal);
  if (!ready) return null;

  const batch = stockBatches[ready.stockIdx - 1];
  const cols = new Array<number[]>(ready.cols.length);
  let foundations = ready.foundations;

  for (let c = 0; c < ready.cols.length; c++) {
    const col = ready.cols[c].slice();
    col.push(batch[c] | 1);
    if (checkAndRemoveCompletedSuitPacked(col)) {
      foundations++;
    }
    cols[c] = col;
  }

  const nextStockIdx = ready.stockIdx - 1;
  const moves = ready.moves + 1;

  return {
    cols,
    stockIdx: nextStockIdx,
    foundations,
    moves,
    score: evaluateBoard(cols, foundations, nextStockIdx, moves),
    hash: computeCanonicalHash(cols, nextStockIdx, foundations),
  };
}

function colKey(col: number[]): string {
  if (col.length === 0) return '';
  let s = '';
  for (let i = 0; i < col.length; i++) {
    s += String.fromCharCode(col[i] + 1);
  }
  return s;
}

function generateCandidateMoves(
  st: PackedState,
  allowSplits: boolean,
  strictPrune: boolean
): PackedState[] {
  const cols = st.cols;
  const numCols = cols.length;

  let firstEmpty = -1;
  for (let i = 0; i < numCols; i++) {
    if (cols[i].length === 0) {
      firstEmpty = i;
      break;
    }
  }

  // Deduplicate identical destination columns and identical source columns
  const colKeys: string[] = new Array(numCols);
  for (let i = 0; i < numCols; i++) {
    colKeys[i] = colKey(cols[i]);
  }

  const completeMoves: PackedState[] = [];
  const revealMergeMoves: PackedState[] = [];
  const normalMoves: Array<{ state: PackedState; priority: number }> = [];
  const seenSrcKeys = new Set<string>();

  for (let f = 0; f < numCols; f++) {
    const src = cols[f];
    if (src.length === 0) continue;
    if (seenSrcKeys.has(colKeys[f])) continue;
    seenSrcKeys.add(colKeys[f]);

    const mStart = getMovableStartPacked(src);
    if (mStart >= src.length) continue;

    const minIdx = mStart;
    const maxIdx = src.length - 1;

    for (let idx = minIdx; idx <= maxIdx; idx++) {
      const movingCard = src[idx];
      const movingSuit = getSuit(movingCard);
      const movingRank = getRank(movingCard);
      const bottomRank = getRank(src[src.length - 1]);
      const isSplitting = idx > mStart;
      const srcAboveLen = idx - mStart;
      const wouldEmpty = idx === 0 && isFaceUp(src[0]);
      const wouldReveal = idx > 0 && !isFaceUp(src[idx - 1]);

      // Check if exposing src[idx - 1] could enable a same-suit merge for src[idx - 1]
      const exposedCanMergeSameSuit =
        idx > 0 && isFaceUp(src[idx - 1]) && !isSplitting;

      const seenDestKeys = new Set<string>();

      for (let t = 0; t < numCols; t++) {
        if (t === f) continue;
        const dest = cols[t];
        const isEmpty = dest.length === 0;

        if (isEmpty && t !== firstEmpty) continue;
        if (wouldEmpty && isEmpty) continue;

        if (!isEmpty) {
          const destTop = dest[dest.length - 1];
          if (!isFaceUp(destTop) || getRank(destTop) !== movingRank + 1) {
            continue;
          }
          if (seenDestKeys.has(colKeys[t])) continue;
          seenDestKeys.add(colKeys[t]);
        }

        const isSameSuit = !isEmpty && getSuit(dest[dest.length - 1]) === movingSuit;
        const destStart = isEmpty ? 0 : getMovableStartPacked(dest);
        const destLen = isEmpty ? 0 : dest.length - destStart;
        const completesSuit =
          !isEmpty && isSameSuit && bottomRank === 1 && getRank(dest[destStart]) === 13;

        if (isSplitting) {
          const validSameSuitSplit = completesSuit || (isSameSuit && destLen > srcAboveLen);
          if (!validSameSuitSplit) {
            if (!allowSplits) continue;
            if (isEmpty && idx < src.length - 1) continue;
          }
        }

        // In strict prune mode (fast pass), filter out lateral off-suit moves that don't flip or empty
        if (strictPrune && !completesSuit && !isSameSuit && !wouldReveal && !wouldEmpty) {
          if (isEmpty) {
            // Only move into empty column to expose an underlying card if it might unlock something
            if (!exposedCanMergeSameSuit) continue;
          } else {
            // Check quickly whether moving off-suit exposes a card that matches some same-suit parent
            if (!exposedCanMergeSameSuit) continue;
            const exposedSuit = getSuit(src[idx - 1]);
            const exposedRank = getRank(src[idx - 1]);
            let hasSameSuitHome = false;
            for (let k = 0; k < numCols; k++) {
              if (k === f || k === t) continue;
              const kc = cols[k];
              if (kc.length === 0) continue;
              const kTop = kc[kc.length - 1];
              if (
                isFaceUp(kTop) &&
                getSuit(kTop) === exposedSuit &&
                getRank(kTop) === exposedRank + 1
              ) {
                hasSameSuitHome = true;
                break;
              }
            }
            if (!hasSameSuitHome) continue;
          }
        }

        const next = applyMovePacked(st, f, idx, t);
        if (completesSuit) {
          completeMoves.push(next);
          return completeMoves;
        }
        if (isSameSuit && wouldReveal) {
          revealMergeMoves.push(next);
        } else {
          let prio = 0;
          if (isSameSuit) prio = 500 + destLen * 10 + (wouldEmpty ? 200 : 0);
          else if (wouldReveal) prio = 350 + (isEmpty ? 0 : 100);
          else if (wouldEmpty) prio = 250;
          else prio = isEmpty ? 40 : 80;
          normalMoves.push({ state: next, priority: prio + next.score * 0.01 });
        }
      }
    }
  }

  if (revealMergeMoves.length > 0 && strictPrune) {
    return revealMergeMoves;
  }

  normalMoves.sort((a, b) => b.priority - a.priority);
  const maxKeep = strictPrune ? 8 : 14;
  const result: PackedState[] = revealMergeMoves.slice();
  for (let i = 0; i < normalMoves.length && result.length < maxKeep; i++) {
    result.push(normalMoves[i].state);
  }
  return result;
}

function runBeamPass(
  root: PackedState,
  stockBatches: number[][],
  relaxedStockDeal: boolean,
  foundationSlots: number,
  beamWidth: number,
  maxNodes: number,
  allowSplits: boolean,
  strictPrune: boolean
): { solvable: boolean; movesCount?: number; visitedNodes: number } {
  let visitedNodes = 1;

  if (root.foundations >= foundationSlots) {
    return { solvable: true, movesCount: root.moves, visitedNodes };
  }
  if (isAutoCompletablePacked(root.cols, root.stockIdx, root.foundations, foundationSlots)) {
    const finalMoves = countAutoCompleteMoves(
      root.cols,
      root.foundations,
      root.moves,
      foundationSlots
    );
    if (finalMoves !== null) {
      return { solvable: true, movesCount: finalMoves, visitedNodes };
    }
  }

  const totalStages = root.stockIdx + 1;
  let stageBeam: PackedState[] = [root];

  for (let stageIdx = root.stockIdx; stageIdx >= 0; stageIdx--) {
    if (stageBeam.length === 0 || visitedNodes >= maxNodes) break;

    const isFinalStage = stageIdx === 0;
    const remainingBudget = maxNodes - visitedNodes;
    const stageNodeBudget = isFinalStage
      ? remainingBudget
      : Math.max(beamWidth * 6, Math.floor((remainingBudget * 0.7) / (stageIdx + 1)));
    const stageLimit = visitedNodes + stageNodeBudget;

    const maxPlies = isFinalStage ? 400 : root.cols.length >= 14 ? 48 : 36;
    const stageSeen = new Set<string>();
    const preDealPool: PackedState[] = [];

    for (const s of stageBeam) {
      stageSeen.add(s.hash);
      if (!isFinalStage) {
        preDealPool.push(s);
      }
    }

    let currentPlyBeam = stageBeam;
    let stalePlies = 0;
    let bestStageScore = currentPlyBeam[0].score;

    for (let ply = 0; ply < maxPlies; ply++) {
      if (currentPlyBeam.length === 0 || visitedNodes >= stageLimit) break;

      const nextPlyCandidates: PackedState[] = [];

      for (let i = 0; i < currentPlyBeam.length; i++) {
        if (visitedNodes >= stageLimit) break;
        const node = currentPlyBeam[i];
        const children = generateCandidateMoves(node, allowSplits, strictPrune);

        for (let c = 0; c < children.length; c++) {
          const child = children[c];
          if (stageSeen.has(child.hash)) continue;
          stageSeen.add(child.hash);
          visitedNodes++;

          if (child.foundations >= foundationSlots) {
            return { solvable: true, movesCount: child.moves, visitedNodes };
          }
          if (
            isAutoCompletablePacked(
              child.cols,
              child.stockIdx,
              child.foundations,
              foundationSlots
            )
          ) {
            const finalMoves = countAutoCompleteMoves(
              child.cols,
              child.foundations,
              child.moves,
              foundationSlots
            );
            if (finalMoves !== null) {
              return { solvable: true, movesCount: finalMoves, visitedNodes };
            }
          }

          nextPlyCandidates.push(child);
          if (visitedNodes >= stageLimit) break;
        }
      }

      if (nextPlyCandidates.length === 0) break;

      nextPlyCandidates.sort((a, b) => b.score - a.score);
      if (nextPlyCandidates.length > beamWidth) {
        nextPlyCandidates.length = beamWidth;
      }

      if (!isFinalStage) {
        const takeCount = Math.min(nextPlyCandidates.length, Math.max(8, beamWidth));
        for (let k = 0; k < takeCount; k++) {
          preDealPool.push(nextPlyCandidates[k]);
        }
      }

      if (nextPlyCandidates[0].score > bestStageScore) {
        bestStageScore = nextPlyCandidates[0].score;
        stalePlies = 0;
      } else {
        stalePlies++;
        if (!isFinalStage && stalePlies >= 10) {
          break;
        }
        if (isFinalStage && stalePlies >= 42) {
          break;
        }
      }

      currentPlyBeam = nextPlyCandidates;
    }

    if (isFinalStage) {
      break;
    }

    // Transition pre-deal pool into next stage (stageIdx - 1)
    preDealPool.sort((a, b) => b.score - a.score);
    const maxPreDealToTry = Math.min(preDealPool.length, Math.max(24, beamWidth * 3));
    const nextStageSeen = new Set<string>();
    const nextStageBeam: PackedState[] = [];

    for (let i = 0; i < maxPreDealToTry; i++) {
      if (visitedNodes >= maxNodes) break;
      const dealt = applyDealPacked(preDealPool[i], stockBatches, relaxedStockDeal);
      if (!dealt) continue;
      if (nextStageSeen.has(dealt.hash)) continue;
      nextStageSeen.add(dealt.hash);
      visitedNodes++;

      if (dealt.foundations >= foundationSlots) {
        return { solvable: true, movesCount: dealt.moves, visitedNodes };
      }
      if (
        isAutoCompletablePacked(
          dealt.cols,
          dealt.stockIdx,
          dealt.foundations,
          foundationSlots
        )
      ) {
        const finalMoves = countAutoCompleteMoves(
          dealt.cols,
          dealt.foundations,
          dealt.moves,
          foundationSlots
        );
        if (finalMoves !== null) {
          return { solvable: true, movesCount: finalMoves, visitedNodes };
        }
      }

      nextStageBeam.push(dealt);
    }

    nextStageBeam.sort((a, b) => b.score - a.score);
    if (nextStageBeam.length > beamWidth) {
      nextStageBeam.length = beamWidth;
    }
    stageBeam = nextStageBeam;

    if (totalStages > 1 && stageBeam.length === 0) {
      break;
    }
  }

  return { solvable: false, visitedNodes };
}

export function solveDeal(
  initialState: GameState,
  options?: SolveOptions
): SolveResult {
  const spec = getDeckLayoutSpec(initialState.config.decks);
  const defaultNodes =
    initialState.config.decks === 2
      ? 45000
      : initialState.config.decks === 3
        ? 110000
        : 130000;
  const maxNodes = options?.maxNodes ?? defaultNodes;
  const requestedBeam = options?.beamWidth ?? 28;

  const packedCols = initialState.columns.map((col) => col.map(packCard));
  const stockBatches = initialState.stock.map((batch) => batch.map(packCard));
  const initialFoundations = initialState.foundations.length;

  const root: PackedState = {
    cols: packedCols,
    stockIdx: stockBatches.length,
    foundations: initialFoundations,
    moves: 0,
    score: evaluateBoard(packedCols, initialFoundations, stockBatches.length, 0),
    hash: computeCanonicalHash(packedCols, stockBatches.length, initialFoundations),
  };

  // Pass 1: Lightning-fast narrow beam with strict smart-move pruning
  const pass1Width = Math.min(requestedBeam, 10);
  const pass1Budget = Math.max(100, Math.floor(maxNodes * 0.25));
  const res1 = runBeamPass(
    root,
    stockBatches,
    initialState.config.relaxedStockDeal,
    spec.foundationSlots,
    pass1Width,
    pass1Budget,
    false,
    true
  );

  if (res1.solvable || res1.visitedNodes >= maxNodes) {
    return res1;
  }

  // Pass 2: Medium beam allowing tactical splits with smart-move pruning
  const remainingAfter1 = maxNodes - res1.visitedNodes;
  if (remainingAfter1 < 200) {
    return res1;
  }
  const pass2Width = Math.min(requestedBeam, 22);
  const pass2Budget = Math.floor(remainingAfter1 * 0.45);
  const res2 = runBeamPass(
    root,
    stockBatches,
    initialState.config.relaxedStockDeal,
    spec.foundationSlots,
    pass2Width,
    pass2Budget,
    true,
    true
  );

  if (res2.solvable || res1.visitedNodes + res2.visitedNodes >= maxNodes) {
    return {
      solvable: res2.solvable,
      movesCount: res2.movesCount,
      visitedNodes: res1.visitedNodes + res2.visitedNodes,
    };
  }

  // Pass 3: Wide beam with full legal moves + tactical splits enabled
  const remainingBudget = maxNodes - res1.visitedNodes - res2.visitedNodes;
  if (remainingBudget < 200) {
    return {
      solvable: false,
      visitedNodes: res1.visitedNodes + res2.visitedNodes,
    };
  }

  const res3 = runBeamPass(
    root,
    stockBatches,
    initialState.config.relaxedStockDeal,
    spec.foundationSlots,
    requestedBeam,
    remainingBudget,
    true,
    false
  );

  return {
    solvable: res3.solvable,
    movesCount: res3.movesCount,
    visitedNodes: res1.visitedNodes + res2.visitedNodes + res3.visitedNodes,
  };
}
