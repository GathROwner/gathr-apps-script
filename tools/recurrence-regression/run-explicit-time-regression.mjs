import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const functionsDir = path.join(repoRoot, 'functions');
const fixturesPath = path.join(__dirname, 'fixtures', 'explicit-time-fixtures.json');
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.skipBuild) {
    ensureBuild();
  }

  const modulePath = pathToFileURL(
    path.join(functionsDir, 'lib', 'parsing', 'postParser.js')
  ).href;
  const postParserModule = await import(modulePath);
  const extractRange =
    postParserModule.extractExplicitTimeRangeForRegression ||
    postParserModule.default?.extractExplicitTimeRangeForRegression;
  const extractEnd =
    postParserModule.extractExplicitEndTimeForRegression ||
    postParserModule.default?.extractExplicitEndTimeForRegression;

  if (typeof extractRange !== 'function' || typeof extractEnd !== 'function') {
    throw new Error('Explicit time regression exports were not found.');
  }

  const fixtures = loadFixtures(args.caseId);
  if (fixtures.length === 0) {
    throw new Error(args.caseId ? `No fixture found for case "${args.caseId}".` : 'No fixtures found.');
  }

  fs.mkdirSync(resultsDir, { recursive: true });

  const results = fixtures.map((fixture) => {
    const actualRange = extractRange(fixture.startEvidence || '', fixture.endEvidence || '');
    const actualEndTime = extractEnd(fixture.endEvidence || '');
    const mismatches = [];

    if (fixture.expectRange) {
      if (JSON.stringify(actualRange) !== JSON.stringify(fixture.expectRange)) {
        mismatches.push({
          field: 'range',
          expected: fixture.expectRange,
          actual: actualRange,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(fixture, 'expectEndTime')) {
      if (actualEndTime !== fixture.expectEndTime) {
        mismatches.push({
          field: 'endTime',
          expected: fixture.expectEndTime,
          actual: actualEndTime,
        });
      }
    }

    return {
      id: fixture.id,
      description: fixture.description,
      passed: mismatches.length === 0,
      startEvidence: fixture.startEvidence || '',
      endEvidence: fixture.endEvidence || '',
      actualRange,
      actualEndTime,
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
    `explicit-time-regression-report-${timestampForFilename()}.json`
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
