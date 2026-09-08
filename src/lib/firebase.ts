import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

const meta = import.meta as any;
const env = meta.env || {};

const PROD_HOST = 'pagemanager.vercel.app';

/**
 * Firebase Web config is not a secret. For the production hostname we pin the
 * frontend to the dedicated production Firebase project so an old AI Studio
 * applet config or a stale/missing Vercel VITE_* build variable can never route
 * production authentication back to the AI Studio Firebase project.
 */
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

export const firebaseRuntimeInfo = {
  host: runtimeHost || '(server/build)',
  source: forceProductionFirebase
    ? 'pinned-production'
    : hasExternalFirebaseOverride
      ? 'environment'
      : 'ai-studio-fallback',
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
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
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
    console.error('Failed to initialize Firebase client:', error);
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
