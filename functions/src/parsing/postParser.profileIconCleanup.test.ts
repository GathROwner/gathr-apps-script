import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareManagedProfileIconUrlForRegression } from './postParser.js';

test('existing managed venue profile is returned without cleanup ownership', async () => {
  const url = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/venue-avatar.webp';
  assert.deepEqual(await prepareManagedProfileIconUrlForRegression(url), {
    url,
    createdForThisParse: false,
  });
});

test('empty profile icon is not a cleanup candidate', async () => {
  assert.deepEqual(await prepareManagedProfileIconUrlForRegression(''), {
    url: '',
    createdForThisParse: false,
  });
});
