import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dealFromSeed } from '../src/engine/rules';
import { solveDeal } from '../src/engine/solver';
import { type DeckCount, type SuitCount, getModeKey } from '../src/engine/types';

const DECKS: DeckCount[] = [2, 3, 4];
const SUITS: SuitCount[] = [1, 2, 3, 4];

const TARGET_SEEDS_PER_MODE = process.argv.includes('--diag') ? 2 : 16;
const MAX_ATTEMPTS_PER_MODE = process.argv.includes('--diag') ? 25 : 400;

async function main(): Promise<void> {
  const isDiag = process.argv.includes('--diag');
  const results: Record<string, number[]> = {};
  const startAll = Date.now();

  for (const decks of DECKS) {
    for (const suits of SUITS) {
      const key = getModeKey(decks, suits);
      const seeds: number[] = [];
      const modeStart = Date.now();
      let attempts = 0;

      // Use deterministic spaced seed range per mode so seeds differ across modes
      let candidateSeed = decks * 100000 + suits * 10000 + 1;

      while (seeds.length < TARGET_SEEDS_PER_MODE && attempts < MAX_ATTEMPTS_PER_MODE) {
        attempts++;
        const state = dealFromSeed({
          decks,
          suits,
          winningDealOnly: true,
          relaxedStockDeal: false,
          seed: candidateSeed,
        });
        const res = solveDeal(state);
        if (res.solvable) {
          seeds.push(candidateSeed);
        }
        candidateSeed += 7;
      }

      results[key] = seeds;
      const elapsed = ((Date.now() - modeStart) / 1000).toFixed(2);
      console.log(
        `[${key}] found ${seeds.length}/${TARGET_SEEDS_PER_MODE} seeds in ${attempts} attempts (${elapsed}s) -> [${seeds.slice(0, 5).join(', ')}...]`
      );
    }
  }

  if (isDiag) {
    console.log(`Diagnostic finished in ${((Date.now() - startAll) / 1000).toFixed(2)}s`);
    return;
  }

  const lines: string[] = [
    '// Auto-generated verified winning seeds for all 12 deck/suit modes.',
    '// Every seed here has been solved end-to-end under classic Spider rules using solveDeal().',
    '',
    'export const VERIFIED_WINNING_SEEDS: Record<string, number[]> = {',
  ];

  for (const decks of DECKS) {
    for (const suits of SUITS) {
      const key = getModeKey(decks, suits);
      lines.push(`  '${key}': [${results[key].join(', ')}],`);
    }
  }
  lines.push('};');
  lines.push('');

  const outPath = resolve(process.cwd(), 'src/engine/winningSeeds.ts');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Done in ${((Date.now() - startAll) / 1000).toFixed(2)}s -> wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
