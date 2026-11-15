import { describe, expect, it } from 'vitest';
import {
  findWinningSeedSync,
  generateDeal,
  requestWinningSeedAsync,
} from '../dealGenerator';
import { getMeaningfulHints } from '../hint';
import {
  canDealStock,
  canPlaceRunOnColumn,
  cloneGameState,
  dealFromSeed,
  dealFromStock,
  executeMove,
  getAutoCompleteStep,
  getMovableStartIndex,
  getSuitDistribution,
  getValidDestinations,
  isAutoCompletable,
  isMovableRun,
  undoMove,
} from '../rules';
import { solveDeal } from '../solver';
import {
  type Card,
  type DeckCount,
  type GameState,
  type Rank,
  type Suit,
  type SuitCount,
  getDeckLayoutSpec,
  getModeKey,
} from '../types';
import { VERIFIED_WINNING_SEEDS } from '../winningSeeds';

let testCardId = 10000;
function mkCard(suit: Suit, rank: Rank, faceUp = true): Card {
  return { id: testCardId++, suit, rank, faceUp };
}

function mkCustomState(
  columns: Card[][],
  opts?: {
    decks?: DeckCount;
    suits?: SuitCount;
    stock?: Card[][];
    relaxedStockDeal?: boolean;
    lastMoveSignature?: string;
    foundationsCount?: number;
  }
): GameState {
  const decks = opts?.decks ?? 2;
  const spec = getDeckLayoutSpec(decks);
  const paddedCols: Card[][] = Array.from({ length: spec.columns }, (_, i) =>
    columns[i] ? columns[i].map((c) => ({ ...c })) : []
  );

  const foundations = Array.from({ length: opts?.foundationsCount ?? 0 }, (_, idx) => ({
    suit: 'spades' as Suit,
    cards: [] as Card[],
    completedAtMove: idx + 1,
  }));

  return {
    config: {
      decks,
      suits: opts?.suits ?? 2,
      winningDealOnly: false,
      relaxedStockDeal: opts?.relaxedStockDeal ?? false,
      seed: 42,
    },
    columns: paddedCols,
    stock: opts?.stock ? opts.stock.map((b) => b.map((c) => ({ ...c }))) : [],
    foundations,
    moves: 0,
    score: 500,
    elapsedSeconds: 0,
    hasStarted: false,
    isWon: false,
    hintsUsed: 0,
    undoStack: [],
    lastMoveSignature: opts?.lastMoveSignature,
  };
}

function buildRun(suit: Suit, fromRank: number, toRank: number, faceUp = true): Card[] {
  const cards: Card[] = [];
  for (let r = fromRank; r >= toRank; r--) {
    cards.push(mkCard(suit, r as Rank, faceUp));
  }
  return cards;
}

describe('Deck layouts and dealFromSeed across all 12 modes', () => {
  const decksList: DeckCount[] = [2, 3, 4];
  const suitsList: SuitCount[] = [1, 2, 3, 4];

  for (const decks of decksList) {
    for (const suits of suitsList) {
      it(`deals valid initial state for ${decks} decks x ${suits} suits`, () => {
        const spec = getDeckLayoutSpec(decks);
        const dist = getSuitDistribution(decks, suits);
        expect(dist.length).toBe(spec.foundationSlots);
        expect(new Set(dist).size).toBe(suits);

        const state = dealFromSeed({
          decks,
          suits,
          winningDealOnly: false,
          relaxedStockDeal: false,
          seed: 12345,
        });

        expect(state.columns.length).toBe(spec.columns);
        expect(state.stock.length).toBe(spec.stockDeals);
        expect(state.foundations.length).toBe(0);
        expect(state.score).toBe(500);
        expect(state.moves).toBe(0);
        expect(state.isWon).toBe(false);

        const seenIds = new Set<number>();
        const suitCounts: Record<string, number> = {};

        state.columns.forEach((col, colIdx) => {
          expect(col.length).toBe(spec.initialPerColumn[colIdx]);
          col.forEach((card, rowIdx) => {
            seenIds.add(card.id);
            suitCounts[card.suit] = (suitCounts[card.suit] ?? 0) + 1;
            expect(card.faceUp).toBe(rowIdx === col.length - 1);
          });
        });

        state.stock.forEach((batch) => {
          expect(batch.length).toBe(spec.columns);
          batch.forEach((card) => {
            seenIds.add(card.id);
            suitCounts[card.suit] = (suitCounts[card.suit] ?? 0) + 1;
            expect(card.faceUp).toBe(false);
          });
        });

        expect(seenIds.size).toBe(spec.totalCards);
        for (const s of Object.keys(suitCounts)) {
          expect(suitCounts[s] % 13).toBe(0);
        }

        // Deterministic from same seed
        const repeat = dealFromSeed({
          decks,
          suits,
          winningDealOnly: false,
          relaxedStockDeal: false,
          seed: 12345,
        });
        expect(repeat.columns).toEqual(state.columns);
        expect(repeat.stock).toEqual(state.stock);
      });
    }
  }
});

describe('Movable runs, placement, and getValidDestinations sorting', () => {
  it('computes isMovableRun and getMovableStartIndex accurately', () => {
    const empty: Card[] = [];
    expect(getMovableStartIndex(empty)).toBe(0);
    expect(isMovableRun(empty, 0)).toBe(false);

    const mixed = [
      mkCard('spades', 10, false),
      mkCard('hearts', 9, true),
      mkCard('spades', 8, true),
      mkCard('spades', 7, true),
    ];
    expect(getMovableStartIndex(mixed)).toBe(2);
    expect(isMovableRun(mixed, 0)).toBe(false);
    expect(isMovableRun(mixed, 1)).toBe(false);
    expect(isMovableRun(mixed, 2)).toBe(true);
    expect(isMovableRun(mixed, 3)).toBe(true);
  });

  it('sorts getValidDestinations by completeSuit > sameSuit (longest first) > offSuit > empty', () => {
    const state = mkCustomState([
      // col 0: [2♠..A♠] (actually let's move [2♠, A♠] onto K♠..3♠!)
      [mkCard('spades', 2), mkCard('spades', 1)],
      // col 1: empty
      [],
      // col 2: off-suit 3♥
      [mkCard('hearts', 3)],
      // col 3: short same-suit 3♠
      [mkCard('spades', 3)],
      // col 4: longer same-suit 5♠, 4♠, 3♠
      [mkCard('spades', 5), mkCard('spades', 4), mkCard('spades', 3)],
      // col 5: completes K♠..3♠
      buildRun('spades', 13, 3),
    ]);

    const dests = getValidDestinations(state, 0, 0);
    // Col 5 completes suit, Col 4 longer same-suit, Col 3 shorter same-suit, Col 2 off-suit, Col 1 & 6..9 empty
    expect(dests[0].toCol).toBe(5);
    expect(dests[0].wouldCompleteSuit).toBe(true);
    expect(dests[1].toCol).toBe(4);
    expect(dests[1].isSameSuit).toBe(true);
    expect(dests[2].toCol).toBe(3);
    expect(dests[2].isSameSuit).toBe(true);
    expect(dests[3].toCol).toBe(2);
    expect(dests[3].isSameSuit).toBe(false);
    expect(dests[3].isEmpty).toBe(false);
    expect(dests[4].isEmpty).toBe(true);
  });

  it('enforces canPlaceRunOnColumn rules', () => {
    expect(canPlaceRunOnColumn(mkCard('spades', 5), [])).toBe(true);
    expect(canPlaceRunOnColumn(mkCard('spades', 5), [mkCard('hearts', 6)])).toBe(true);
    expect(canPlaceRunOnColumn(mkCard('spades', 5), [mkCard('hearts', 7)])).toBe(false);
    expect(canPlaceRunOnColumn(mkCard('spades', 5), [mkCard('hearts', 6, false)])).toBe(false);
  });
});

describe('Stock dealing, suit completion on deal, and undo symmetry', () => {
  it('forbids stock deal with empty columns in classic mode, allows in relaxedStockDeal', () => {
    const batch = Array.from({ length: 10 }, () => mkCard('spades', 5, false));
    const classic = mkCustomState(
      [[mkCard('spades', 9)], [], [mkCard('spades', 9)]],
      { stock: [batch], relaxedStockDeal: false }
    );
    expect(canDealStock(classic)).toBe(false);
    expect(dealFromStock(classic)).toBeNull();

    const relaxedCols = Array.from({ length: 10 }, (_, i) =>
      i === 1 ? [] : [mkCard('spades', 9)]
    );
    const relaxed = mkCustomState(relaxedCols, { stock: [batch], relaxedStockDeal: true });
    expect(canDealStock(relaxed)).toBe(true);
    const dealt = dealFromStock(relaxed);
    expect(dealt).not.toBeNull();
    expect(dealt!.nextState.columns[1].length).toBe(1);
    expect(dealt!.nextState.columns[1][0].faceUp).toBe(true);
  });

  it('completes a K..A suit on stock deal, flips buried card, and cleanly undoes', () => {
    const buriedUnderKing = mkCard('hearts', 10, false);
    const cols: Card[][] = Array.from({ length: 10 }, (_, i) => {
      if (i === 0) {
        return [buriedUnderKing, ...buildRun('spades', 13, 2)];
      }
      if (i === 1) {
        return [mkCard('clubs', 7, false), ...buildRun('hearts', 13, 2)];
      }
      return [mkCard('diamonds', 8)];
    });

    const batch: Card[] = Array.from({ length: 10 }, (_, i) => {
      if (i === 0) return mkCard('spades', 1, false);
      if (i === 1) return mkCard('hearts', 1, false);
      return mkCard('clubs', 4, false);
    });

    const initial = mkCustomState(cols, { stock: [batch], relaxedStockDeal: false });
    const snapshot = cloneGameState(initial);

    const dealRes = dealFromStock(initial);
    expect(dealRes).not.toBeNull();
    const afterDeal = dealRes!.nextState;

    expect(afterDeal.foundations.length).toBe(2);
    expect(afterDeal.foundations[0].suit).toBe('spades');
    expect(afterDeal.foundations[1].suit).toBe('hearts');
    expect(afterDeal.columns[0].length).toBe(1);
    expect(afterDeal.columns[0][0].id).toBe(buriedUnderKing.id);
    expect(afterDeal.columns[0][0].faceUp).toBe(true);
    expect(afterDeal.columns[1].length).toBe(1);
    expect(afterDeal.columns[1][0].faceUp).toBe(true);
    expect(afterDeal.moves).toBe(1);
    expect(afterDeal.score).toBe(500 - 1 + 200);

    const undoRes = undoMove(afterDeal);
    expect(undoRes).not.toBeNull();
    const reverted = undoRes!.nextState;

    expect(reverted.foundations.length).toBe(0);
    expect(reverted.stock.length).toBe(1);
    expect(reverted.moves).toBe(0);
    expect(reverted.score).toBe(500);
    expect(reverted.columns).toEqual(snapshot.columns);
    expect(reverted.stock).toEqual(snapshot.stock);
    expect(reverted.columns[0][0].faceUp).toBe(false);
    expect(reverted.columns[1][0].faceUp).toBe(false);
  });

  it('reverts move, card flip, suit completion, post-complete flip, win state, and lastMoveSignature on undo', () => {
    const fdSrc = mkCard('diamonds', 4, false);
    const fdDest = mkCard('clubs', 9, false);
    const state = mkCustomState(
      [
        [fdSrc, mkCard('spades', 2), mkCard('spades', 1)],
        [fdDest, ...buildRun('spades', 13, 3)],
      ],
      { foundationsCount: 7, lastMoveSignature: '3->4:999' }
    );
    const initialSnap = cloneGameState(state);

    const moveRes = executeMove(state, 0, 1, 1);
    expect(moveRes).not.toBeNull();
    const wonState = moveRes!.nextState;

    expect(wonState.isWon).toBe(true);
    expect(wonState.foundations.length).toBe(8);
    expect(wonState.columns[0][0].faceUp).toBe(true);
    expect(wonState.columns[1][0].faceUp).toBe(true);
    expect(wonState.moves).toBe(1);
    expect(wonState.score).toBe(599);
    expect(wonState.lastMoveSignature).not.toBe('3->4:999');

    const undone = undoMove(wonState);
    expect(undone).not.toBeNull();
    const restored = undone!.nextState;

    expect(restored.isWon).toBe(false);
    expect(restored.foundations.length).toBe(7);
    expect(restored.columns).toEqual(initialSnap.columns);
    expect(restored.moves).toBe(0);
    expect(restored.score).toBe(500);
    expect(restored.lastMoveSignature).toBe('3->4:999');
    expect(restored.undoStack.length).toBe(0);
  });
});

describe('MobilityWare-style Hint Engine', () => {
  it('never suggests splitting an unbroken same-suit run onto a different suit or shorter/equal same-suit parent', () => {
    const state = mkCustomState([
      [mkCard('spades', 9), mkCard('spades', 8), mkCard('spades', 7)],
      [mkCard('hearts', 8)], // off-suit parent for 7♠
      [mkCard('spades', 8)], // equal length (1 <= 2 above 7♠)
      [mkCard('diamonds', 12)],
    ]);

    const hints = getMeaningfulHints(state);
    // Moving 7♠ onto 8♥ (split onto off-suit) or 8♠ (not strictly longer) MUST NOT appear!
    // Nor should moving the entire col 0 [9♠,8♠,7♠] into an empty column!
    expect(hints.length).toBe(0);
  });

  it('allows splitting an unbroken same-suit run ONLY onto a strictly longer same-suit head or completing suit', () => {
    const state = mkCustomState([
      [mkCard('spades', 9), mkCard('spades', 8), mkCard('spades', 7)],
      [mkCard('spades', 10), mkCard('spades', 9)], // length 2 > above-run length 1!
      [mkCard('hearts', 9)],
    ]);

    const hints = getMeaningfulHints(state);
    expect(hints.length).toBe(1);
    expect(hints[0]).toMatchObject({
      kind: 'move',
      fromCol: 0,
      fromIndex: 1,
      toCol: 1,
      category: 'same-suit-merge',
    });
  });

  it('never suggests sliding an entire exposed single-run column into an empty column and deduplicates empty columns', () => {
    const state = mkCustomState([
      [mkCard('spades', 10), mkCard('spades', 9)], // fromIndex 0, no face-down
      [mkCard('hearts', 5, false), mkCard('spades', 4)], // reveals FD card!
      [], // empty col 2
      [], // empty col 3
      [], // empty col 4
    ]);

    const hints = getMeaningfulHints(state);
    // Only col 1 -> first empty col 2 should be suggested (deduplicated, and col 0 -> empty excluded)
    expect(hints.length).toBe(1);
    expect(hints[0]).toMatchObject({
      kind: 'move',
      fromCol: 1,
      fromIndex: 1,
      toCol: 2,
      category: 'reveal-card',
    });
  });

  it('rejects pointless lateral shifts onto different suits unless 2-ply lookahead unlocks a merge, flip, or completion', () => {
    const pointless = mkCustomState([
      [mkCard('hearts', 9), mkCard('spades', 8)],
      [mkCard('diamonds', 9)],
      [mkCard('clubs', 13)],
      [mkCard('spades', 13)],
      [mkCard('hearts', 13)],
      [mkCard('diamonds', 13)],
      [mkCard('clubs', 13)],
      [mkCard('spades', 13)],
      [mkCard('hearts', 13)],
      [mkCard('diamonds', 13)],
    ]);
    expect(getMeaningfulHints(pointless)).toEqual([]);

    // 2-ply unlock: [10♣, 9♥, 8♠] -> move 8♠ onto [K♣, 9♦] unlocks 9♥ merging onto 10♥!
    const unlockMerge = mkCustomState([
      [mkCard('clubs', 10), mkCard('hearts', 9), mkCard('spades', 8)],
      [mkCard('clubs', 13), mkCard('diamonds', 9)],
      [mkCard('hearts', 10)],
      [mkCard('clubs', 13)],
      [mkCard('diamonds', 13)],
      [mkCard('spades', 13)],
      [mkCard('hearts', 13)],
      [mkCard('clubs', 13)],
      [mkCard('diamonds', 13)],
      [mkCard('spades', 13)],
    ]);
    const unlockHints = getMeaningfulHints(unlockMerge);
    expect(unlockHints.length).toBeGreaterThan(0);
    expect(unlockHints[0]).toMatchObject({
      kind: 'move',
      fromCol: 0,
      fromIndex: 2,
      toCol: 1,
      category: 'unlock-play',
    });

    // 2-ply unlock Direction 2: [K♥..9♥, 8♠] + [8♥..A♥] -> moving 8♠ onto [K♣, 9♦] unlocks suit completion!
    const unlockComplete = mkCustomState([
      [...buildRun('hearts', 13, 9), mkCard('spades', 8)],
      [mkCard('clubs', 13), mkCard('diamonds', 9)],
      buildRun('hearts', 8, 1),
    ]);
    const completeUnlockHints = getMeaningfulHints(unlockComplete);
    expect(
      completeUnlockHints.some(
        (h) => h.kind === 'move' && h.category === 'unlock-play' && h.fromCol === 0 && h.toCol === 1
      )
    ).toBe(true);
  });

  it('avoids ping-pong reversals of state.lastMoveSignature when another move or deal exists', () => {
    const start = mkCustomState([
      [mkCard('spades', 8)],
      [mkCard('hearts', 9)],
      [mkCard('clubs', 5, false), mkCard('diamonds', 6)],
      [mkCard('clubs', 7)],
    ]);
    const moved = executeMove(start, 0, 0, 1)!;
    expect(getMeaningfulHints(moved.nextState)[0]).toMatchObject({
      kind: 'move',
      fromCol: 2,
      toCol: 3,
      category: 'reveal-card',
    });

    // Direct reversal guard: c8 moving back 1->0 onto 9♠ would reverse lastMoveSignature '0->1:id'
    const c8 = mkCard('spades', 8);
    const sigState = mkCustomState(
      [
        [mkCard('spades', 9)],
        [mkCard('diamonds', 9), c8],
        [mkCard('hearts', 5, false), mkCard('clubs', 4)],
        [mkCard('diamonds', 5)],
        [mkCard('clubs', 13)],
        [mkCard('spades', 13)],
        [mkCard('hearts', 13)],
        [mkCard('diamonds', 13)],
        [mkCard('clubs', 13)],
        [mkCard('spades', 13)],
      ],
      { lastMoveSignature: `0->1:${c8.id}` }
    );
    const sigHints = getMeaningfulHints(sigState);
    expect(sigHints.length).toBe(1);
    expect(sigHints[0]).toMatchObject({
      kind: 'move',
      fromCol: 2,
      toCol: 3,
      category: 'reveal-card',
    });

    // When the previous move flipped a face-down card that happens to be a same-suit parent (7♠),
    // merging 6♠ onto the newly flipped 7♠ IS allowed even though it goes toCol -> fromCol!
    const flippedSameSuit = mkCard('spades', 7, false);
    const card6 = mkCard('spades', 6);
    const preFlip = mkCustomState([
      [flippedSameSuit, card6],
      [mkCard('hearts', 7)],
      [mkCard('clubs', 13)],
      [mkCard('diamonds', 13)],
    ]);
    const afterFlip = executeMove(preFlip, 0, 1, 1)!.nextState;
    expect(afterFlip.columns[0][0].faceUp).toBe(true);
    const postFlipHints = getMeaningfulHints(afterFlip);
    expect(postFlipHints[0]).toMatchObject({
      kind: 'move',
      fromCol: 1,
      fromIndex: 1,
      toCol: 0,
      category: 'same-suit-merge',
    });
  });

  it('ranks hints in strategic priority order', () => {
    const state = mkCustomState([
      buildRun('spades', 13, 2), // col 0: K♠..2♠
      [mkCard('spades', 1)], // col 1: A♠ -> completes suit on col 0!
      [mkCard('hearts', 5, false), mkCard('hearts', 8)], // col 2: reveal-and-merge onto col 3!
      [mkCard('hearts', 9)], // col 3
      [mkCard('clubs', 6)], // col 4: same-suit-merge onto col 5!
      [mkCard('clubs', 7)], // col 5
      [mkCard('diamonds', 4, false), mkCard('diamonds', 10)], // col 6: reveal-card onto col 7!
      [mkCard('clubs', 11)], // col 7
      [mkCard('diamonds', 3)], // col 8: empty-column onto col 9!
      [mkCard('spades', 4)], // col 9
    ]);

    const hints = getMeaningfulHints(state);
    const categories = hints.map((h) => h.category);
    expect(categories[0]).toBe('complete-suit');
    expect(categories).toContain('reveal-and-merge');
    expect(categories).toContain('same-suit-merge');
    expect(categories).toContain('reveal-card');
    expect(categories).toContain('empty-column');

    const idxComplete = categories.indexOf('complete-suit');
    const idxRevMerge = categories.indexOf('reveal-and-merge');
    const idxMerge = categories.indexOf('same-suit-merge');
    const idxReveal = categories.indexOf('reveal-card');
    const idxEmpty = categories.indexOf('empty-column');
    expect(idxComplete).toBeLessThan(idxRevMerge);
    expect(idxRevMerge).toBeLessThan(idxMerge);
    expect(idxMerge).toBeLessThan(idxReveal);
    expect(idxReveal).toBeLessThan(idxEmpty);
  });

  it('falls back to deal-stock when no meaningful tableau move exists, or tactical-shift to fill an empty column blocking classic deal', () => {
    const batch = Array.from({ length: 10 }, () => mkCard('spades', 2, false));
    // All 10 columns non-empty, no valid moves -> deal-stock
    const readyToDeal = mkCustomState(
      Array.from({ length: 10 }, () => [mkCard('spades', 10)]),
      { stock: [batch], relaxedStockDeal: false }
    );
    const dealHints = getMeaningfulHints(readyToDeal);
    expect(dealHints).toEqual([
      {
        kind: 'deal',
        score: 100,
        category: 'deal-stock',
        reason: expect.any(String),
      },
    ]);

    // Column 9 is empty, classic rules block dealing, no meaningful moves -> suggest filling empty col
    const blockedByEmpty = mkCustomState(
      [
        [mkCard('hearts', 12), mkCard('spades', 5)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [mkCard('spades', 10)],
        [],
      ],
      { stock: [batch], relaxedStockDeal: false }
    );
    const fillHints = getMeaningfulHints(blockedByEmpty);
    expect(fillHints.length).toBeGreaterThan(0);
    expect(fillHints[0]).toMatchObject({
      kind: 'move',
      fromCol: 0,
      fromIndex: 1,
      toCol: 9,
      category: 'tactical-shift',
    });
  });
});

describe('Auto-complete detection and step execution', () => {
  it('detects auto-completable state and completes all suits cleanly without looping', () => {
    const state = mkCustomState([
      buildRun('spades', 13, 9),
      buildRun('spades', 8, 5),
      buildRun('spades', 4, 1),
      buildRun('hearts', 13, 7),
      buildRun('hearts', 6, 1),
    ], { foundationsCount: 6 });

    expect(isAutoCompletable(state)).toBe(true);

    let current = state;
    let steps = 0;
    while (!current.isWon && steps < 20) {
      const step = getAutoCompleteStep(current);
      expect(step).not.toBeNull();
      const res = executeMove(current, step!.fromCol, step!.fromIndex, step!.toCol);
      expect(res).not.toBeNull();
      current = res!.nextState;
      steps++;
    }

    expect(current.isWon).toBe(true);
    expect(current.foundations.length).toBe(8);
    expect(isAutoCompletable(current)).toBe(false);
    expect(getAutoCompleteStep(current)).toBeNull();
  });

  it('returns false for isAutoCompletable when stock remains, face-down exists, or suit break exists', () => {
    const withBreak = mkCustomState([
      [mkCard('hearts', 9), mkCard('spades', 8)],
      buildRun('spades', 7, 1),
    ]);
    expect(isAutoCompletable(withBreak)).toBe(false);

    const withFaceDown = mkCustomState([
      [mkCard('spades', 9, false), mkCard('spades', 8)],
    ]);
    expect(isAutoCompletable(withFaceDown)).toBe(false);

    const withStock = mkCustomState([buildRun('spades', 13, 1)], {
      stock: [[mkCard('spades', 2, false)]],
    });
    expect(isAutoCompletable(withStock)).toBe(false);
  });
});

describe('Verified winning seeds, dealGenerator, and solver verification', () => {
  const decksList: DeckCount[] = [2, 3, 4];
  const suitsList: SuitCount[] = [1, 2, 3, 4];

  it('contains at least 12 verified winning seeds for all 12 deck/suit modes', () => {
    for (const decks of decksList) {
      for (const suits of suitsList) {
        const key = getModeKey(decks, suits);
        const seeds = VERIFIED_WINNING_SEEDS[key];
        expect(Array.isArray(seeds)).toBe(true);
        expect(seeds.length).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('verifies seeds from VERIFIED_WINNING_SEEDS across all 12 modes solve via solveDeal()', () => {
    for (const decks of decksList) {
      for (const suits of suitsList) {
        const key = getModeKey(decks, suits);
        const seeds = VERIFIED_WINNING_SEEDS[key];
        // Verify first 3 seeds of every single mode in test run for fast CI speed
        for (const seed of seeds.slice(0, 3)) {
          const state = dealFromSeed({
            decks,
            suits,
            winningDealOnly: true,
            relaxedStockDeal: false,
            seed,
          });
          const result = solveDeal(state);
          expect(result.solvable).toBe(true);
          expect(result.movesCount).toBeGreaterThan(0);
        }
      }
    }
  }, 60000);

  it('generateDeal respects winningDealOnly and usedSeeds exclusion', () => {
    const key = getModeKey(2, 2);
    const bank = VERIFIED_WINNING_SEEDS[key];
    const used = new Set<number>(bank.slice(0, bank.length - 1));
    const dealt = generateDeal(
      {
        decks: 2,
        suits: 2,
        winningDealOnly: true,
        relaxedStockDeal: false,
      },
      used
    );
    expect(dealt.config.seed).toBe(bank[bank.length - 1]);
  });

  it('findWinningSeedSync and requestWinningSeedAsync return valid solvable seeds', async () => {
    const syncSeed = findWinningSeedSync(2, 1, 500, 10);
    expect(syncSeed).not.toBeNull();
    const syncRes = solveDeal(
      dealFromSeed({
        decks: 2,
        suits: 1,
        winningDealOnly: true,
        relaxedStockDeal: false,
        seed: syncSeed!,
      })
    );
    expect(syncRes.solvable).toBe(true);

    const excluded = [1, 2, 3, ...VERIFIED_WINNING_SEEDS['2d-1s']];
    const asyncSeed = await requestWinningSeedAsync(2, 1, excluded);
    expect(typeof asyncSeed).toBe('number');
    expect(excluded.includes(asyncSeed)).toBe(false);
    const asyncRes = solveDeal(
      dealFromSeed({
        decks: 2,
        suits: 1,
        winningDealOnly: true,
        relaxedStockDeal: false,
        seed: asyncSeed,
      })
    );
    expect(asyncRes.solvable).toBe(true);
  });

  it('handles invalid moves, empty undoStack, won-state hints, and fill-empty minimal-split fallback cleanly', () => {
    const base = dealFromSeed({
      decks: 2,
      suits: 2,
      winningDealOnly: false,
      relaxedStockDeal: false,
      seed: 777,
    });
    const baseSnap = cloneGameState(base);

    expect(undoMove(base)).toBeNull();
    expect(executeMove(base, 0, 0, 1)).toBeNull(); // face-down card at index 0
    expect(executeMove(base, 0, 5, 0)).toBeNull(); // same column
    expect(executeMove(base, -1, 0, 1)).toBeNull();
    expect(executeMove(base, 0, 5, 99)).toBeNull();
    expect(getValidDestinations(base, 0, 0)).toEqual([]);
    expect(getValidDestinations(base, 99, 0)).toEqual([]);
    // Original state must remain completely unmutated
    expect(base).toEqual(baseSnap);

    const wonState = mkCustomState([], { foundationsCount: 8 });
    wonState.isWon = true;
    expect(getMeaningfulHints(wonState)).toEqual([]);
    expect(executeMove(wonState, 0, 0, 1)).toBeNull();

    // Every non-empty column is an unbroken same-suit run [K♠, Q♠] etc., col 9 is empty, stock remains
    const batch = Array.from({ length: 10 }, () => mkCard('spades', 2, false));
    const allRunsBlocked = mkCustomState(
      [
        [mkCard('spades', 13), mkCard('spades', 12)],
        [mkCard('spades', 13), mkCard('spades', 12)],
        [mkCard('hearts', 13), mkCard('hearts', 12)],
        [mkCard('hearts', 13), mkCard('hearts', 12)],
        [mkCard('clubs', 13), mkCard('clubs', 12)],
        [mkCard('clubs', 13), mkCard('clubs', 12)],
        [mkCard('diamonds', 13), mkCard('diamonds', 12)],
        [mkCard('diamonds', 13), mkCard('diamonds', 12)],
        [mkCard('spades', 10)],
        [],
      ],
      { stock: [batch], relaxedStockDeal: false }
    );
    const fillSplitHints = getMeaningfulHints(allRunsBlocked);
    expect(fillSplitHints.length).toBeGreaterThan(0);
    expect(fillSplitHints[0]).toMatchObject({
      kind: 'move',
      fromIndex: 1,
      toCol: 9,
      category: 'tactical-shift',
    });
  });

  it('maintains exact undo symmetry across a sequence of hints, moves, and stock deals', () => {
    let state = dealFromSeed({
      decks: 2,
      suits: 1,
      winningDealOnly: true,
      relaxedStockDeal: false,
      seed: VERIFIED_WINNING_SEEDS['2d-1s'][0],
    });
    const history: GameState[] = [cloneGameState(state)];

    for (let step = 0; step < 30; step++) {
      const hints = getMeaningfulHints(state);
      if (hints.length === 0) break;
      const top = hints[0];
      if (top.kind === 'move') {
        const res = executeMove(state, top.fromCol, top.fromIndex, top.toCol);
        expect(res).not.toBeNull();
        state = res!.nextState;
      } else {
        const res = dealFromStock(state);
        expect(res).not.toBeNull();
        state = res!.nextState;
      }
      history.push(cloneGameState(state));
    }

    expect(state.moves).toBe(history.length - 1);

    for (let i = history.length - 2; i >= 0; i--) {
      const undone = undoMove(state);
      expect(undone).not.toBeNull();
      state = undone!.nextState;
      const expected = history[i];
      expect(state.columns).toEqual(expected.columns);
      expect(state.stock).toEqual(expected.stock);
      expect(state.foundations).toEqual(expected.foundations);
      expect(state.moves).toBe(expected.moves);
      expect(state.score).toBe(expected.score);
      expect(state.lastMoveSignature).toBe(expected.lastMoveSignature);
      expect(state.isWon).toBe(expected.isWon);
    }

    expect(undoMove(state)).toBeNull();
  });
});
