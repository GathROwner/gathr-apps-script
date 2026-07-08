import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWN_PEI_CITY_NAMES,
  isCityLevelAutoPublishEnabled,
  normalizePeiPlaceName,
  resolvePeiCentroid,
} from './peiLocations.js';

test('resolvePeiCentroid resolves exact city names via locationCity', () => {
  const centroid = resolvePeiCentroid({ locationCity: 'Charlottetown' });
  assert.ok(centroid);
  assert.equal(centroid.scope, 'city');
  assert.equal(centroid.latitude, 46.2382);
  assert.equal(centroid.longitude, -63.1311);
});

test('resolvePeiCentroid resolves "City, PE" label forms', () => {
  const centroid = resolvePeiCentroid({ locationLabel: 'Kensington, PE' });
  assert.ok(centroid);
  assert.equal(centroid.city, 'Kensington');
  assert.equal(centroid.scope, 'city');
});

test('resolvePeiCentroid resolves "City, PEI" and P.E.I. punctuation variants', () => {
  for (const label of ['Summerside, PEI', 'Summerside, P.E.I.', 'Summerside, Prince Edward Island']) {
    const centroid = resolvePeiCentroid({ locationLabel: label });
    assert.ok(centroid, `expected centroid for ${label}`);
    assert.equal(centroid.city, 'Summerside');
  }
});

test('resolvePeiCentroid resolves Downtown Charlottetown as area scope', () => {
  const centroid = resolvePeiCentroid({ locationLabel: 'Downtown Charlottetown' });
  assert.ok(centroid);
  assert.equal(centroid.scope, 'area');
  assert.equal(centroid.city, 'Charlottetown');
  assert.equal(centroid.latitude, 46.2343);
  assert.equal(centroid.longitude, -63.1258);
});

test('resolvePeiCentroid prefers locationCity over locationLabel', () => {
  const centroid = resolvePeiCentroid({
    locationCity: 'Montague',
    locationLabel: 'Some Unknown Place, PEI',
  });
  assert.ok(centroid);
  assert.equal(centroid.city, 'Montague');
});

test('resolvePeiCentroid prefers the specific area label for area-scope events', () => {
  const centroid = resolvePeiCentroid({
    locationScope: 'area',
    locationCity: 'Charlottetown',
    locationLabel: 'Downtown Charlottetown',
  });
  assert.ok(centroid);
  assert.equal(centroid.scope, 'area');
  assert.equal(centroid.latitude, 46.2343);
  assert.equal(centroid.longitude, -63.1258);
});

test('resolvePeiCentroid keeps city-scope Charlottetown on the city centroid', () => {
  const centroid = resolvePeiCentroid({
    locationScope: 'city',
    locationCity: 'Charlottetown',
    locationLabel: 'Charlottetown, PEI',
  });
  assert.ok(centroid);
  assert.equal(centroid.scope, 'city');
  assert.equal(centroid.latitude, 46.2382);
  assert.equal(centroid.longitude, -63.1311);
});

test('resolvePeiCentroid distinguishes Rustico from North Rustico', () => {
  const rustico = resolvePeiCentroid({ locationCity: 'Rustico' });
  const northRustico = resolvePeiCentroid({ locationCity: 'North Rustico' });
  assert.ok(rustico);
  assert.ok(northRustico);
  assert.notEqual(rustico.latitude, northRustico.latitude);
});

test('resolvePeiCentroid returns null for unknown places', () => {
  assert.equal(resolvePeiCentroid({ locationLabel: 'Borden-Carleton, PE' }), null);
  assert.equal(resolvePeiCentroid({ locationCity: 'Moncton' }), null);
});

test('resolvePeiCentroid returns null for province-only labels', () => {
  assert.equal(resolvePeiCentroid({ locationLabel: 'PEI' }), null);
  assert.equal(resolvePeiCentroid({ locationLabel: 'PE' }), null);
  assert.equal(resolvePeiCentroid({ locationLabel: 'Prince Edward Island' }), null);
});

test('resolvePeiCentroid returns null for empty input', () => {
  assert.equal(resolvePeiCentroid({}), null);
  assert.equal(resolvePeiCentroid({ locationCity: '', locationLabel: '  ' }), null);
});

test('normalizePeiPlaceName collapses PEI variants and punctuation', () => {
  assert.equal(normalizePeiPlaceName('Charlottetown, P.E.I., Canada'), 'charlottetown pei');
  assert.equal(normalizePeiPlaceName('  North   Rustico '), 'north rustico');
  assert.equal(normalizePeiPlaceName('Prince Edward Island'), 'pei');
});

test('KNOWN_PEI_CITY_NAMES contains the shared-promotion city set', () => {
  for (const name of [
    'charlottetown', 'cornwall', 'stratford', 'summerside', 'montague',
    'kensington', 'souris', 'alberton', 'georgetown', 'north rustico', 'cavendish',
  ]) {
    assert.ok(KNOWN_PEI_CITY_NAMES.has(name), `expected ${name}`);
  }
  assert.ok(!KNOWN_PEI_CITY_NAMES.has('downtown charlottetown'), 'areas are not city names');
});

test('isCityLevelAutoPublishEnabled honors the env kill switch', () => {
  const original = process.env.CITY_LEVEL_AUTO_PUBLISH;
  try {
    delete process.env.CITY_LEVEL_AUTO_PUBLISH;
    assert.equal(isCityLevelAutoPublishEnabled(), true);
    process.env.CITY_LEVEL_AUTO_PUBLISH = 'false';
    assert.equal(isCityLevelAutoPublishEnabled(), false);
    process.env.CITY_LEVEL_AUTO_PUBLISH = 'off';
    assert.equal(isCityLevelAutoPublishEnabled(), false);
    process.env.CITY_LEVEL_AUTO_PUBLISH = 'true';
    assert.equal(isCityLevelAutoPublishEnabled(), true);
  } finally {
    if (original === undefined) {
      delete process.env.CITY_LEVEL_AUTO_PUBLISH;
    } else {
      process.env.CITY_LEVEL_AUTO_PUBLISH = original;
    }
  }
});
