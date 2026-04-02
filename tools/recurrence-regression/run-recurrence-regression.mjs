import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const functionsDir = path.join(repoRoot, 'functions');
const fixturesPath = path.join(__dirname, 'fixtures', 'recurrence-normalization-fixtures.json');
const resultsDir = path.join(__dirname, 'results');
const ABSENT = '__absent__';

function parseArgs(argv) {
  const parsed = { caseId: '', skipBuild: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--case') {
      parsed.caseId = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--no-build') {
      parsed.skipBuild = true;
    }
  }
  return parsed;
}

function ensureBuild() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'build'], {
    cwd: functionsDir,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function loadFixtures(caseId) {
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  if (!caseId) return fixtures;
  return fixtures.filter((fixture) => fixture.id === caseId);
}

function compareExpected(actual, expected, currentPath = '') {
  const mismatches = [];

  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    const actualValue = actual?.[key];

    if (expectedValue === ABSENT) {
      if (actualValue !== undefined) {
        mismatches.push({
          path: nextPath,
          expected: ABSENT,
          actual: actualValue,
        });
      }
      continue;
    }

    if (
      expectedValue &&
      typeof expectedValue === 'object' &&
      !Array.isArray(expectedValue)
    ) {
      mismatches.push(...compareExpected(actualValue || {}, expectedValue, nextPath));
      continue;
    }

    const matches = Array.isArray(expectedValue)
      ? JSON.stringify(actualValue) === JSON.stringify(expectedValue)
      : actualValue === expectedValue;

    if (!matches) {
      mismatches.push({
        path: nextPath,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }

  return mismatches;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.skipBuild) {
    ensureBuild();
  }

  const modulePath = pathToFileURL(
    path.join(functionsDir, 'lib', 'parsing', 'finalFormatter.js')
  ).href;
  const formatterModule = await import(modulePath);
  const normalize =
    formatterModule.applyRecurrenceNormalizationForRegression ||
    formatterModule.default?.applyRecurrenceNormalizationForRegression;
  if (typeof normalize !== 'function') {
    throw new Error('applyRecurrenceNormalizationForRegression export was not found.');
  }

  const fixtures = loadFixtures(args.caseId);
  if (fixtures.length === 0) {
    throw new Error(args.caseId ? `No fixture found for case "${args.caseId}".` : 'No fixtures found.');
  }

  fs.mkdirSync(resultsDir, { recursive: true });

  const results = fixtures.map((fixture) => {
    const actual = normalize(
      structuredClone(fixture.event),
      fixture.originalItem ? structuredClone(fixture.originalItem) : undefined
    );
    const mismatches = compareExpected(actual, fixture.expect);
    return {
      id: fixture.id,
      description: fixture.description,
      passed: mismatches.length === 0,
      mismatches,
      expected: fixture.expect,
      actual,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    caseCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    results,
  };

  const reportPath = path.join(
    resultsDir,
    `recurrence-regression-report-${timestampForFilename()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${result.id}`);
    if (!result.passed) {
      for (const mismatch of result.mismatches) {
        console.log(
          `  ${mismatch.path}: expected ${JSON.stringify(mismatch.expected)} got ${JSON.stringify(mismatch.actual)}`
        );
      }
    }
  }

  console.log(`Report: ${reportPath}`);

  if (report.failedCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
