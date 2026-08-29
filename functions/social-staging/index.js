'use strict';

const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

Object.assign(exports, require('./lib/social/callables.js'));
Object.assign(exports, require('./lib/social/cleanup.js'));
Object.assign(exports, require('./lib/social/profileSync.js'));
Object.assign(exports, require('./lib/social/accountCleanup.js'));
Object.assign(exports, require('./lib/social/venueMirror.js'));
