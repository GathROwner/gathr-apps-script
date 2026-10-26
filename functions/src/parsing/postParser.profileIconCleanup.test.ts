import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareManagedProfileIconUrlForRegression, selectUnusedManagedImageUrls } from './postParser.js';

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

test('cleanup does not request deletion of protected profiles, even for a held post',()=>{
 const base='https://storage.googleapis.com/gathr-uploaded-images/';
 assert.deepEqual(selectUnusedManagedImageUrls([base+'profilepictures/new-avatar.webp',base+'postimages/temp-band.webp'],[]),[base+'postimages/temp-band.webp']);
});
