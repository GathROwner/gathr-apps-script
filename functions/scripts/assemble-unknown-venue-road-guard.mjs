// Reproduce the resolver-only release from its immutable serving source archive.
// Never build resolver endpoints from the parser's different source baseline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serving = path.resolve(process.argv[2] || '');
const readbackFile = path.resolve(process.argv[3] || '');
assert(process.argv[2] && process.argv[3], 'Supply extracted serving source and current function readback');
const resolver = path.join(serving, 'src/services/unknownVenueResolver.ts');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const original = fs.readFileSync(resolver);
assert.equal(sha(original), '2a3c070dbf9fbff707e852ca22eeb9f6556acd1cbac2845cdfa1b2c2dc10bc15', 'Unexpected resolver source baseline');
const readback = JSON.parse(fs.readFileSync(readbackFile, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(readback.state, 'ACTIVE');
const replaceOne = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `Missing/nonunique assembly anchor: ${from.slice(0,60)}`);
  return text.replace(from, to);
};
let text = original.toString('utf8');
const nl = text.includes('\r\n') ? '\r\n' : '\n';
text = replaceOne(text, "import { logger } from '../utils/logger.js';",
  "import { logger } from '../utils/logger.js';" + nl + "import { namedVenueCandidateIsCompatible } from './venueIdentity.js';");
const anchor = '      const details = place?.placeId ? await placesService.getPlaceDetails(place.placeId) : null;';
text = replaceOne(text, anchor, [
  '      if (!namedVenueCandidateIsCompatible({ observedName: rawName, candidateTypes: place?.types || [] })) {',
  "        logger.info('Rejected geographic-only Places result for named venue', {",
  '          observedName: rawName, candidateName: place?.name, candidateTypes: place?.types, cityHint, provinceHint,',
  '        });', '        return [];', '      }', anchor,
].join(nl));
text = replaceOne(text, 'confidence: Math.max(0.7, placesConfidence),', 'confidence: placesConfidence,');
assert(text.includes('export function getMunicipalPlaceNameVariants'), 'Serving municipal identity repair must remain');
fs.writeFileSync(resolver, text);
for (const name of ['venueIdentity.ts', 'venueIdentity.test.ts']) {
  fs.copyFileSync(path.join(functionsRoot, 'src/services', name), path.join(serving, 'src/services', name));
}
fs.mkdirSync(path.join(serving, 'src/services/fixtures'), { recursive: true });
fs.copyFileSync(path.join(functionsRoot, 'src/services/fixtures/venue-resolution.json'), path.join(serving, 'src/services/fixtures/venue-resolution.json'));
// Source archives omit .env. Preserve current user configuration; the platform
// regenerates function-specific/runtime-owned keys for each target.
const managed = /^(?:FUNCTION_|EVENTARC_|FIREBASE_|K_|GCLOUD_PROJECT$|GCP_PROJECT$|CLOUD_RUNTIME_CONFIG$|PORT$)/;
const environment = Object.entries(readback.serviceConfig.environmentVariables || {}).filter(([key]) => !managed.test(key));
fs.writeFileSync(path.join(serving, '.env'), environment.map(([key,value]) => `${key}=${JSON.stringify(String(value))}`).join('\n') + '\n');
const manifest = { assembledAt: new Date().toISOString(), sourceArchiveSha256: 'cb73e65710a5645d7f3e978a5f0b3395f382df722342caef82f1ad7e0f4f9c4b',
  resolverBeforeSha256: sha(original), resolverAfterSha256: sha(fs.readFileSync(resolver)),
  helperSha256: sha(fs.readFileSync(path.join(serving, 'src/services/venueIdentity.ts'))),
  configurationKeysPreserved: environment.map(([key]) => key), liveWrites: 0 };
fs.writeFileSync(path.join(path.dirname(serving), 'unknown-assembly.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ resolverBeforeSha256: manifest.resolverBeforeSha256,
  resolverAfterSha256: manifest.resolverAfterSha256, configurationKeyCount: environment.length }));
