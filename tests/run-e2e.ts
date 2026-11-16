import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerContext, TestSuite, TestCase } from './helpers/test-runner.js';

// Force UTC and test environment variables
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

const ARGS = process.argv.slice(2);
const TIER_FILTER = ARGS.find((a) => a.startsWith('--tier='))?.split('=')[1];
const GREP_FILTER = ARGS.find((a) => a.startsWith('--grep=') || a.startsWith('--filter='))?.split('=')[1];
const IS_VERBOSE = ARGS.includes('--verbose') || ARGS.includes('-v');
const IS_BAIL = ARGS.includes('--bail');

interface TierSummary {
  name: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

function findTestFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findTestFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function determineTier(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.includes('tier1-features')) return 'Tier 1: Feature Equivalence';
  if (norm.includes('tier2-boundaries')) return 'Tier 2: Boundary & Corner';
  if (norm.includes('tier3-cross-feature')) return 'Tier 3: Cross-Feature';
  if (norm.includes('tier4-scenarios')) return 'Tier 4: Scenarios';
  if (norm.includes('harness-smoke')) return 'Harness Smoke';
  return 'General E2E';
}

async function main() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(70));
  console.log(' HIPMI PT TELKOM UNIVERSITY — E2E TEST RUNNER & TEST HARNESS');
  console.log('='.repeat(70));
  console.log(`Working Directory: ${process.cwd()}`);
  console.log(`Execution Mode:    Node ${process.version} with tsx ESM runner`);
  if (TIER_FILTER) console.log(`Tier Filter:       ${TIER_FILTER}`);
  if (GREP_FILTER) console.log(`Grep Filter:       ${GREP_FILTER}`);
  console.log('='.repeat(70) + '\n');

  const testsDir = path.resolve(process.cwd(), 'tests', 'e2e');
  let testFiles = findTestFiles(testsDir);

  if (TIER_FILTER) {
    testFiles = testFiles.filter((f) => {
      const tier = determineTier(f).toLowerCase();
      return tier.includes(TIER_FILTER.toLowerCase());
    });
  }

  if (testFiles.length === 0) {
    console.warn(`No test files found matching criteria in: ${testsDir}`);
    process.exit(0);
  }

  console.log(`Discovered ${testFiles.length} test suite file(s):\n`);
  for (const f of testFiles) {
    console.log(`  • [${determineTier(f)}] ${path.relative(process.cwd(), f)}`);
  }
  console.log('\n' + '-'.repeat(70) + '\n');

  // Load and register all test suites
  for (const file of testFiles) {
    runnerContext.currentTier = determineTier(file);
    const fileUrl = pathToFileURL(file).href;
    try {
      await import(fileUrl);
    } catch (err: any) {
      console.error(`\n❌ Failed to load test suite file: ${file}`);
      console.error(err.stack || err.message);
      process.exit(1);
    }
  }

  // Filter tests if GREP is active
  if (GREP_FILTER) {
    const regex = new RegExp(GREP_FILTER, 'i');
    for (const suite of runnerContext.suites) {
      suite.tests = suite.tests.filter((t: TestCase) => regex.test(t.name) || regex.test(suite.name));
    }
  }

  const tierSummaries: Record<string, TierSummary> = {};
  let overallPassed = 0;
  let overallFailed = 0;
  let overallTotal = 0;

  // Execute all suites
  for (const suite of runnerContext.suites) {
    if (suite.tests.length === 0) continue;

    const tierKey = suite.tier;
    if (!tierSummaries[tierKey]) {
      tierSummaries[tierKey] = {
        name: tierKey,
        total: 0,
        passed: 0,
        failed: 0,
        durationMs: 0,
      };
    }
    const summary = tierSummaries[tierKey];

    console.log(`\n📦 Suite: [${suite.tier}] ${suite.name}`);

    // Run beforeAll hooks
    for (const hook of suite.beforeAllHooks) {
      try {
        await hook();
      } catch (err: any) {
        console.error(`  ❌ beforeAll hook failed in suite "${suite.name}":`, err.message);
        throw err;
      }
    }

    // Run tests
    for (const test of suite.tests) {
      summary.total++;
      overallTotal++;

      // Run beforeEach hooks
      for (const hook of suite.beforeEachHooks) {
        try {
          await hook();
        } catch (err: any) {
          console.error(`  ❌ beforeEach hook failed in test "${test.name}":`, err.message);
          throw err;
        }
      }

      const tStart = Date.now();
      try {
        await test.fn();
        test.durationMs = Date.now() - tStart;
        test.status = 'passed';
        summary.passed++;
        overallPassed++;
        summary.durationMs += test.durationMs;
        console.log(`  ✓ PASS: ${test.name} (${test.durationMs}ms)`);
      } catch (err: any) {
        test.durationMs = Date.now() - tStart;
        test.status = 'failed';
        test.error = err;
        summary.failed++;
        overallFailed++;
        summary.durationMs += test.durationMs;
        console.error(`  ✗ FAIL: ${test.name} (${test.durationMs}ms)`);
        console.error(`    Error: ${err.message}`);
        if (err.stack && IS_VERBOSE) {
          console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
        }
        if (IS_BAIL) {
          console.error('\nBailing execution on first failure (--bail).');
          process.exit(1);
        }
      }

      // Run afterEach hooks
      for (const hook of suite.afterEachHooks) {
        try {
          await hook();
        } catch (err: any) {
          console.error(`  ❌ afterEach hook failed in test "${test.name}":`, err.message);
        }
      }
    }

    // Run afterAll hooks
    for (const hook of suite.afterAllHooks) {
      try {
        await hook();
      } catch (err: any) {
        console.error(`  ❌ afterAll hook failed in suite "${suite.name}":`, err.message);
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  // Print Summary Table
  console.log('\n' + '='.repeat(70));
  console.log(' EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(
    'Tier / Category'.padEnd(32) +
    'Total'.padStart(8) +
    'Passed'.padStart(10) +
    'Failed'.padStart(10) +
    'Time (ms)'.padStart(10)
  );
  console.log('-'.repeat(70));

  for (const [tier, s] of Object.entries(tierSummaries)) {
    console.log(
      tier.padEnd(32) +
      String(s.total).padStart(8) +
      String(s.passed).padStart(10) +
      String(s.failed).padStart(10) +
      String(s.durationMs).padStart(10)
    );
  }

  console.log('='.repeat(70));
  console.log(
    'TOTAL OVERALL'.padEnd(32) +
    String(overallTotal).padStart(8) +
    String(overallPassed).padStart(10) +
    String(overallFailed).padStart(10) +
    String(totalDuration).padStart(10)
  );
  console.log('='.repeat(70));

  if (overallFailed > 0) {
    console.error(`\n❌ TEST SUITE FAILED: ${overallFailed} failed out of ${overallTotal} test(s).\n`);
    process.exitCode = 1;
    process.exit(1);
  } else {
    console.log(`\n✅ TEST SUITE PASSED: All ${overallPassed} test(s) passed successfully!\n`);
    process.exitCode = 0;
    // Allow lingering libuv IO handles to close gracefully on Windows
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

main().catch((err) => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
