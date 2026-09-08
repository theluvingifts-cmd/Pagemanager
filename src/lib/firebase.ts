import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const meta = import.meta as any;
const env = meta.env || {};

const fallbackConfig = {
  apiKey: 'AIzaSyCzEhBv82ne0ETNcR6gT4T5UouBQzcEd8k',
  authDomain: 'pagemanager-prod.firebaseapp.com',
  projectId: 'pagemanager-prod',
  storageBucket: 'pagemanager-prod.firebasestorage.app',
  messagingSenderId: '1048744114551',
  appId: '1:1048744114551:web:7d77b51bcbcb2985710972',
  firestoreDatabaseId: '(default)',
};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  firestoreDatabaseId: env.VITE_FIRESTORE_DATABASE_ID || fallbackConfig.firestoreDatabaseId,
};

const CLIENT_APP_NAME = 'pagemanager-client-prod';

export const firebaseRuntimeInfo = {
  appName: CLIENT_APP_NAME,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  databaseId: firebaseConfig.firestoreDatabaseId,
};

if (typeof window !== 'undefined') {
  console.info('[PageManager Firebase Runtime]', firebaseRuntimeInfo);
}

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

function getOrInitApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  const existing = getApps().find(a => a.name === CLIENT_APP_NAME);
  app = existing || initializeApp(firebaseConfig, CLIENT_APP_NAME);
  return app;
}

function initServices() {
  const initializedApp = getOrInitApp();
  if (!initializedApp) return;
  auth = auth || getAuth(initializedApp);
  db = db || (
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(initializedApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(initializedApp)
  );
  storage = storage || getStorage(initializedApp);
}

try {
  initServices();
} catch (error) {
  console.error('Failed to initialize Page Manager Firebase client:', error);
}

export function getFirebaseAuth(): Auth | null {
  if (!auth) {
    try { initServices(); } catch (e) { console.error(e); }
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  if (!db) {
    try { initServices(); } catch (e) { console.error(e); }
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  if (!storage) {
    try { initServices(); } catch (e) { console.error(e); }
  }
  return storage;
}

export { app, auth, db, storage };
