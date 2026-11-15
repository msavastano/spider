import { dealFromSeed } from './rules';
import { solveDeal } from './solver';
import { type DeckCount, type SuitCount, getModeKey } from './types';
import { VERIFIED_WINNING_SEEDS } from './winningSeeds';

export interface SolverWorkerRequest {
  requestId: number;
  decks: DeckCount;
  suits: SuitCount;
  excludeSeeds?: number[];
  startSeed?: number;
  maxAttempts?: number;
}

export interface SolverWorkerResponse {
  requestId: number;
  seed: number | null;
}

interface WorkerGlobalScopeLike {
  onmessage: ((event: MessageEvent<SolverWorkerRequest>) => void) | null;
  postMessage(message: SolverWorkerResponse): void;
}

export function searchWinningSeedInWorker(req: SolverWorkerRequest): number | null {
  const excluded = new Set(req.excludeSeeds ?? []);
  const maxAttempts = req.maxAttempts ?? 60;
  let candidate =
    req.startSeed !== undefined
      ? (req.startSeed >>> 0) || 1
      : ((Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0);

  let tested = 0;
  let guard = 0;
  while (tested < maxAttempts && guard < maxAttempts * 4) {
    guard++;
    if (!excluded.has(candidate)) {
      tested++;
      const state = dealFromSeed({
        decks: req.decks,
        suits: req.suits,
        winningDealOnly: true,
        relaxedStockDeal: false,
        seed: candidate,
      });
      const result = solveDeal(state);
      if (result.solvable) {
        return candidate;
      }
    }
    candidate = ((candidate + 1) >>> 0) || 1;
  }

  const bank = VERIFIED_WINNING_SEEDS[getModeKey(req.decks, req.suits)] ?? [];
  const unused = bank.filter((s) => !excluded.has(s));
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }
  return bank.length > 0 ? bank[Math.floor(Math.random() * bank.length)] : null;
}

const isWorkerContext =
  typeof self !== 'undefined' &&
  typeof (self as unknown as { document?: unknown }).document === 'undefined' &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function';

if (isWorkerContext) {
  const workerSelf = self as unknown as WorkerGlobalScopeLike;
  workerSelf.onmessage = (event: MessageEvent<SolverWorkerRequest>) => {
    const req = event.data;
    const seed = searchWinningSeedInWorker(req);
    workerSelf.postMessage({
      requestId: req.requestId,
      seed,
    });
  };
}
