import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

const meta = import.meta as any;
const env = meta.env || {};

const PROD_HOST = 'pagemanager.vercel.app';

const productionFirebaseConfig = {
  apiKey: 'AIzaSyCzEhBv82ne0ETNcR6gT4T5UouBQzcEd8k',
  authDomain: 'pagemanager-prod.firebaseapp.com',
  projectId: 'pagemanager-prod',
  storageBucket: 'pagemanager-prod.firebasestorage.app',
  messagingSenderId: '1048744114551',
  appId: '1:1048744114551:web:7d77b51bcbcb2985710972',
  firestoreDatabaseId: '',
};

const runtimeHost =
  typeof window !== 'undefined' ? String(window.location.hostname || '').toLowerCase() : '';

const forceProductionFirebase = runtimeHost === PROD_HOST;

const hasExternalFirebaseOverride = Boolean(
  String(env.VITE_FIREBASE_PROJECT_ID || '').trim()
);

const externalFirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || appletConfig?.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig?.authDomain || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || appletConfig?.projectId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig?.storageBucket || '',
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig?.messagingSenderId || '',
  appId: env.VITE_FIREBASE_APP_ID || appletConfig?.appId || '',
  firestoreDatabaseId:
    env.VITE_FIRESTORE_DATABASE_ID ||
    (hasExternalFirebaseOverride ? '' : (appletConfig?.firestoreDatabaseId || '')),
};

export const firebaseConfig = forceProductionFirebase
  ? productionFirebaseConfig
  : externalFirebaseConfig;

/**
 * IMPORTANT:
 * AI Studio itself may initialize a DEFAULT Firebase app before Page Manager runs.
 * Reusing getApp() without a name therefore silently reuses the old AI Studio
 * project (fit-world-rghtt), even when firebaseConfig points at pagemanager-prod.
 *
 * Page Manager must own a NAMED Firebase app so it can never inherit AI Studio's
 * default Firebase instance.
 */
const CLIENT_APP_NAME = `pagemanager-client-${String(firebaseConfig.projectId || 'unknown')
  .replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export const firebaseRuntimeInfo = {
  host: runtimeHost || '(server/build)',
  source: forceProductionFirebase
    ? 'pinned-production'
    : hasExternalFirebaseOverride
      ? 'environment'
      : 'ai-studio-fallback',
  appName: CLIENT_APP_NAME,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
};

if (typeof window !== 'undefined') {
  console.info('[PageManager Firebase Runtime]', firebaseRuntimeInfo);
}

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('placeholder') &&
    !firebaseConfig.projectId.includes('placeholder')
  );
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

function getOrInitApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;

  const existing = getApps().find(candidate => candidate.name === CLIENT_APP_NAME);
  app = existing || initializeApp(firebaseConfig, CLIENT_APP_NAME);

  return app;
}

if (isFirebaseConfigured()) {
  try {
    const initializedApp = getOrInitApp();
    if (initializedApp) {
      auth = getAuth(initializedApp);
      db = firebaseConfig.firestoreDatabaseId
        ? getFirestore(initializedApp, firebaseConfig.firestoreDatabaseId)
        : getFirestore(initializedApp);
      storage = getStorage(initializedApp);
    }
  } catch (error) {
    console.error('Failed to initialize Page Manager Firebase client:', error);
  }
}

export function getFirebaseAuth(): Auth | null {
  if (!auth && isFirebaseConfigured()) {
    try {
      const initializedApp = getOrInitApp();
      if (initializedApp) auth = getAuth(initializedApp);
    } catch (e) {
      console.error(e);
    }
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  if (!db && isFirebaseConfigured()) {
    try {
      const initializedApp = getOrInitApp();
      if (initializedApp) {
        db = firebaseConfig.firestoreDatabaseId
          ? getFirestore(initializedApp, firebaseConfig.firestoreDatabaseId)
          : getFirestore(initializedApp);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  if (!storage && isFirebaseConfigured()) {
    try {
      const initializedApp = getOrInitApp();
      if (initializedApp) storage = getStorage(initializedApp);
    } catch (e) {
      console.error(e);
    }
  }
  return storage;
}

export { app, auth, db, storage };
