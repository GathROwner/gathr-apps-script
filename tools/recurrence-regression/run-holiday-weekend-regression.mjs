import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const functionsDir = path.join(repoRoot, 'functions');
const fixturesPath = path.join(__dirname, 'fixtures', 'holiday-weekend-fixtures.json');
const resultsDir = path.join(__dirname, 'results');

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

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isSubset(expected, actual) {
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    return false;
  }
  return Object.entries(expected).every(([key, value]) => isSubset(value, actual[key]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.skipBuild) {
    ensureBuild();
  }

  const modulePath = pathToFileURL(
    path.join(functionsDir, 'lib', 'parsing', 'eventExtractor.js')
  ).href;
  const eventExtractorModule = await import(modulePath);
  const splitSpecials =
    eventExtractorModule.splitMixedHolidayWeekendSpecialsForRegression ||
    eventExtractorModule.default?.splitMixedHolidayWeekendSpecialsForRegression;

  if (typeof splitSpecials !== 'function') {
    throw new Error('Holiday weekend regression export was not found.');
  }

  const fixtures = loadFixtures(args.caseId);
  if (fixtures.length === 0) {
    throw new Error(args.caseId ? `No fixture found for case "${args.caseId}".` : 'No fixtures found.');
  }

  fs.mkdirSync(resultsDir, { recursive: true });

  const results = fixtures.map((fixture) => {
    const actual = splitSpecials(
      fixture.combinedText || '',
      fixture.postedLocalDate || '',
      fixture.specials || []
    );
    const mismatches = [];

    if (actual.length !== fixture.expectCount) {
      mismatches.push({
        field: 'count',
        expected: fixture.expectCount,
        actual: actual.length,
      });
    }

    for (let index = 0; index < (fixture.expect || []).length; index += 1) {
      const expected = fixture.expect[index];
      const actualItem = actual[index];
      if (!isSubset(expected, actualItem)) {
        mismatches.push({
          field: `item_${index}`,
          expected,
          actual: actualItem,
        });
      }
    }

    return {
      id: fixture.id,
      description: fixture.description,
      passed: mismatches.length === 0,
      actualCount: actual.length,
      actual,
      mismatches,
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
    `holiday-weekend-regression-report-${timestampForFilename()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}`);
    for (const mismatch of result.mismatches) {
      console.log(
        `  ${mismatch.field}: expected ${JSON.stringify(mismatch.expected)} got ${JSON.stringify(mismatch.actual)}`
      );
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
