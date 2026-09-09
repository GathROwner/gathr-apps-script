#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const API_BASE = process.argv.find((arg) => arg.startsWith('--apiBase='))?.split('=').slice(1).join('=')
  || 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const PLAN_PATHS = process.argv
  .filter((arg) => arg.startsWith('--plan='))
  .map((arg) => arg.split('=').slice(1).join('='));
const OUTPUT_PATH = process.argv.find((arg) => arg.startsWith('--output='))?.split('=').slice(1).join('=');

if (PLAN_PATHS.length === 0) {
  throw new Error('Pass one or more --plan=<path> arguments');
}

function number(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coordinates(data) {
  const nested = data?.coordinates || {};
  const latitude = number(data?.latitude ?? nested.latitude ?? nested._latitude);
  const longitude = number(data?.longitude ?? nested.longitude ?? nested._longitude);
  return latitude === undefined || longitude === undefined ? null : { latitude, longitude };
}

function coordinatesEqual(actual, expected) {
  return actual && expected &&
    Math.abs(actual.latitude - expected.latitude) <= 1e-7 &&
    Math.abs(actual.longitude - expected.longitude) <= 1e-7;
}

async function main() {
  const targets = PLAN_PATHS.flatMap((planPath) => {
    const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
    return (plan.targets || [])
      .filter((target) => String(target.path || '').includes('/events/'))
      .map((target) => ({
        path: target.path,
        eventId: String(target.path).split('/').at(-1),
        expected: target.canonical,
      }));
  });

  const results = [];
  for (const target of targets) {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(target.eventId)}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) {
      throw new Error(`${target.path}: detail endpoint returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const eventCoordinates = coordinates(payload.event);
    const venueCoordinates = coordinates(payload.venue);
    if (!coordinatesEqual(eventCoordinates, target.expected)) {
      throw new Error(`${target.path}: API event coordinates ${JSON.stringify(eventCoordinates)} do not match ${JSON.stringify(target.expected)}`);
    }
    if (!coordinatesEqual(venueCoordinates, target.expected)) {
      throw new Error(`${target.path}: API venue coordinates ${JSON.stringify(venueCoordinates)} do not match ${JSON.stringify(target.expected)}`);
    }
    results.push({
      path: target.path,
      eventId: target.eventId,
      httpStatus: response.status,
      eventCoordinates,
      venueCoordinates,
      verified: true,
    });
  }

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    planPaths: PLAN_PATHS.map((planPath) => path.resolve(planPath)),
    targetCount: targets.length,
    verifiedCount: results.length,
    results,
  };
  if (OUTPUT_PATH) {
    const resolvedOutput = path.resolve(OUTPUT_PATH);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    checkedAt: report.checkedAt,
    targetCount: report.targetCount,
    verifiedCount: report.verifiedCount,
    outputPath: OUTPUT_PATH ? path.resolve(OUTPUT_PATH) : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
