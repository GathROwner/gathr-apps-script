import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('social runtime code never enables Mapbox permanent geocoding', () => {
  const sourceDirectory = join(process.cwd(), 'src', 'social');
  const runtimeFiles = readdirSync(sourceDirectory)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  const violations = runtimeFiles.filter((file) => {
    const source = readFileSync(join(sourceDirectory, file), 'utf8');
    return /searchParams\.set\(\s*['"]permanent['"]\s*,\s*['"]true['"]\s*\)/.test(source)
      || /[?&]permanent=true\b/.test(source);
  });
  assert.deepEqual(violations, []);
});
