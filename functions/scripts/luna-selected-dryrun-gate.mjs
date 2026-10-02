import fs from 'node:fs/promises';
import admin from 'firebase-admin';

const keyPath = 'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json';
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'lunaSelectedDryrunGate');
const db = admin.firestore(app);
const datasets = [
  '1um-iVMpR_c0xhUimqoOqEMx3tXY0l2Qj',
  '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq',
];
const [active, processing, ...locks] = await Promise.all([
  db.collection('processing_locks').where('status', '==', 'active').get(),
  db.collection('processing_locks').where('status', '==', 'processing').get(),
  ...datasets.map(id => db.collection('processing_locks').doc(id).get()),
]);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  activeLocks: [...active.docs, ...processing.docs].map(doc => ({ id: doc.id, status: doc.data().status })),
  targetLocks: locks.map(doc => ({ id: doc.id, status: doc.exists ? doc.data().status : 'absent' })),
}));
