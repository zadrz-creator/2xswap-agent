/**
 * Test suite runner — runs all tests and reports a final summary.
 * Usage: npx ts-node src/tests/run-all.ts
 */

import { execSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../');

const SUITES = [
  { name: 'Technical Indicators', file: 'src/tests/indicators.test.ts' },
  { name: 'Trading Strategies', file: 'src/tests/strategies.test.ts' },
  { name: 'Backtest Engine', file: 'src/tests/backtest.test.ts' },
];

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   2xSwap Agent — Full Test Suite                        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  Running ${SUITES.length} test suites...\n`);

let allPassed = true;
const results: { name: string; status: 'pass' | 'fail' }[] = [];

for (const suite of SUITES) {
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  Suite: ${suite.name}`);
  console.log(`${'═'.repeat(62)}`);

  try {
    execSync(`npx ts-node ${suite.file}`, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 30_000,
    });
    results.push({ name: suite.name, status: 'pass' });
  } catch {
    results.push({ name: suite.name, status: 'fail' });
    allPassed = false;
  }
}

console.log('\n\n╔══════════════════════════════════════════════════════════╗');
console.log('║   Test Suite Summary                                    ║');
console.log('╚══════════════════════════════════════════════════════════╝');

for (const r of results) {
  const icon = r.status === 'pass' ? '✅' : '❌';
  console.log(`  ${icon}  ${r.name}`);
}

const passCount = results.filter((r) => r.status === 'pass').length;
console.log(`\n  ${passCount}/${results.length} suites passed`);

if (!allPassed) {
  console.log('\n  ❌ Some tests failed');
  process.exit(1);
} else {
  console.log('\n  ✅ All test suites passed — agent verified ⚡');
}
