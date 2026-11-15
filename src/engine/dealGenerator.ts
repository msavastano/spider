import { dealFromSeed } from './rules';
import { solveDeal } from './solver';
import {
  type SolverWorkerRequest,
  type SolverWorkerResponse,
  searchWinningSeedInWorker,
} from './solverWorker';
import {
  type DeckCount,
  type GameConfig,
  type GameState,
  type SuitCount,
  getModeKey,
} from './types';
import { VERIFIED_WINNING_SEEDS } from './winningSeeds';

let nextRequestId = 1;

function randomPositiveSeed(): number {
  return (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0;
}

function pickFromVerifiedBank(
  decks: DeckCount,
  suits: SuitCount,
  excluded?: Set<number>
): number | null {
  const bank = VERIFIED_WINNING_SEEDS[getModeKey(decks, suits)] ?? [];
  if (bank.length === 0) return null;
  const available = excluded ? bank.filter((s) => !excluded.has(s)) : bank;
  const pool = available.length > 0 ? available : bank;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function findWinningSeedSync(
  decks: DeckCount,
  suits: SuitCount,
  startSeed?: number,
  maxAttempts = 40,
  excludeSeeds?: Set<number> | number[]
): number | null {
  const excluded =
    excludeSeeds instanceof Set ? excludeSeeds : new Set(excludeSeeds ?? []);
  let candidate =
    startSeed !== undefined ? (startSeed >>> 0) || 1 : randomPositiveSeed();

  let tested = 0;
  let guard = 0;
  while (tested < maxAttempts && guard < maxAttempts * 4) {
    guard++;
    if (!excluded.has(candidate)) {
      tested++;
      const state = dealFromSeed({
        decks,
        suits,
        winningDealOnly: true,
        relaxedStockDeal: false,
        seed: candidate,
      });
      if (solveDeal(state).solvable) {
        return candidate;
      }
    }
    candidate = ((candidate + 1) >>> 0) || 1;
  }

  return null;
}

export function generateDeal(config: GameConfig, usedSeeds?: Set<number>): GameState {
  if (config.seed !== undefined) {
    return dealFromSeed({
      decks: config.decks,
      suits: config.suits,
      winningDealOnly: config.winningDealOnly,
      relaxedStockDeal: config.relaxedStockDeal,
      seed: config.seed,
    });
  }

  if (config.winningDealOnly) {
    const bank = VERIFIED_WINNING_SEEDS[getModeKey(config.decks, config.suits)] ?? [];
    const unused = usedSeeds ? bank.filter((s) => !usedSeeds.has(s)) : bank;
    let chosenSeed: number | null = null;

    if (unused.length > 0) {
      chosenSeed = unused[Math.floor(Math.random() * unused.length)];
    } else {
      chosenSeed = findWinningSeedSync(
        config.decks,
        config.suits,
        randomPositiveSeed(),
        12,
        usedSeeds
      );
      if (chosenSeed === null) {
        chosenSeed = pickFromVerifiedBank(config.decks, config.suits, usedSeeds);
      }
    }

    return dealFromSeed({
      decks: config.decks,
      suits: config.suits,
      winningDealOnly: config.winningDealOnly,
      relaxedStockDeal: config.relaxedStockDeal,
      seed: chosenSeed ?? randomPositiveSeed(),
    });
  }

  let seed = randomPositiveSeed();
  if (usedSeeds && usedSeeds.size > 0) {
    for (let i = 0; i < 32 && usedSeeds.has(seed); i++) {
      seed = randomPositiveSeed();
    }
  }

  return dealFromSeed({
    decks: config.decks,
    suits: config.suits,
    winningDealOnly: config.winningDealOnly,
    relaxedStockDeal: config.relaxedStockDeal,
    seed,
  });
}

export function requestWinningSeedAsync(
  decks: DeckCount,
  suits: SuitCount,
  excludeSeeds?: number[]
): Promise<number> {
  const excluded = excludeSeeds ?? [];
  const excludeSet = new Set(excluded);

  if (typeof Worker !== 'undefined') {
    return new Promise<number>((resolve) => {
      const reqId = nextRequestId++;
      let worker: Worker | null = null;
      let settled = false;

      const finish = (seed: number | null) => {
        if (settled) return;
        settled = true;
        if (worker) {
          worker.terminate();
          worker = null;
        }
        if (seed !== null) {
          resolve(seed);
          return;
        }
        const fallback =
          pickFromVerifiedBank(decks, suits, excludeSet) ??
          findWinningSeedSync(decks, suits, randomPositiveSeed(), 25, excludeSet) ??
          1;
        resolve(fallback);
      };

      const timer = setTimeout(() => {
        finish(null);
      }, 15000);

      try {
        worker = new Worker(new URL('./solverWorker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
          if (event.data.requestId !== reqId) return;
          clearTimeout(timer);
          finish(event.data.seed);
        };

        worker.onerror = () => {
          clearTimeout(timer);
          finish(null);
        };

        const payload: SolverWorkerRequest = {
          requestId: reqId,
          decks,
          suits,
          excludeSeeds: excluded,
          startSeed: randomPositiveSeed(),
          maxAttempts: 45,
        };
        worker.postMessage(payload);
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  }

  return Promise.resolve().then(() => {
    const unusedInBank = pickFromVerifiedBank(decks, suits, excludeSet);
    const quickFound = findWinningSeedSync(
      decks,
      suits,
      randomPositiveSeed(),
      unusedInBank !== null && suits >= 3 ? 5 : 20,
      excludeSet
    );
    if (quickFound !== null) {
      return quickFound;
    }
    if (unusedInBank !== null && !excludeSet.has(unusedInBank)) {
      return unusedInBank;
    }
    const deeper = searchWinningSeedInWorker({
      requestId: 0,
      decks,
      suits,
      excludeSeeds: excluded,
      startSeed: randomPositiveSeed(),
      maxAttempts: 45,
    });
    return deeper ?? unusedInBank ?? 1;
  });
}
