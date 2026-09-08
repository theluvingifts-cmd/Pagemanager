import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

const meta = import.meta as any;
const env = meta.env || {};

/**
 * IMPORTANT:
 * When VITE_FIREBASE_PROJECT_ID is provided (Vercel / external Firebase project),
 * environment variables take priority over AI Studio's firebase-applet-config.json.
 * This lets production use a normal Firebase project while AI Studio Preview can
 * still fall back to the generated applet config.
 */
const hasExternalFirebaseOverride = Boolean(
  String(env.VITE_FIREBASE_PROJECT_ID || '').trim()
);

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || appletConfig?.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig?.authDomain || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || appletConfig?.projectId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig?.storageBucket || '',
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig?.messagingSenderId || '',
  appId: env.VITE_FIREBASE_APP_ID || appletConfig?.appId || '',
  // Normal Firebase projects should use the default database unless explicitly
  // configured otherwise. Never inherit AI Studio's custom DB id after switching project.
  firestoreDatabaseId:
    env.VITE_FIRESTORE_DATABASE_ID ||
    (hasExternalFirebaseOverride ? '' : (appletConfig?.firestoreDatabaseId || '')),
};

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
