import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const ADMIN_APP_NAME = 'pagemanager-admin-prod';

function runtimeProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pagemanager-prod';
}

function runtimeStorageBucket() {
  return process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'pagemanager-prod.firebasestorage.app';
}

export function initFirebaseAdmin(): App | null {
  const existing = getApps().find(app => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const projectId = runtimeProjectId();
  const storageBucket = runtimeStorageBucket();

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket,
      }, ADMIN_APP_NAME);
    }

    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        projectId,
        storageBucket,
      }, ADMIN_APP_NAME);
    }

    try {
      return initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket,
      }, ADMIN_APP_NAME);
    } catch {
      return initializeApp({ projectId, storageBucket }, ADMIN_APP_NAME);
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(initFirebaseAdmin());
}

export function getAdminAuth(): Auth {
  const app = initFirebaseAdmin();
  if (!app) throw new Error('Firebase Admin is not configured.');
  return getAuth(app);
}

export function getAdminDb(): Firestore {
  const app = initFirebaseAdmin();
  if (!app) throw new Error('Firebase Admin is not configured.');
  const databaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIRESTORE_DATABASE_ID;
  return databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);
}

export function getAdminStorage(): Storage {
  const app = initFirebaseAdmin();
  if (!app) throw new Error('Firebase Admin is not configured.');
  return getStorage(app);
}
