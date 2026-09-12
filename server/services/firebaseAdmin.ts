import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const ADMIN_APP_NAME = 'pagemanager-admin-prod';
const EXTERNAL_STORAGE_APP_NAME = 'pagemanager-external-storage';

function runtimeProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pagemanager-prod';
}

function runtimeStorageBucket() {
  return process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'pagemanager-prod.firebasestorage.app';
}

function externalStorageProjectId() {
  return process.env.STORAGE_FIREBASE_PROJECT_ID || '';
}

function externalStorageBucket() {
  return process.env.STORAGE_FIREBASE_BUCKET || '';
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n');
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
          privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
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

/**
 * Firebase Admin app used ONLY for the second Firebase project's Storage.
 * Auth + Firestore continue to use the normal Page Manager Firebase project.
 */
export function initExternalStorageAdmin(): App | null {
  const existing = getApps().find(app => app.name === EXTERNAL_STORAGE_APP_NAME);
  if (existing) return existing;

  const storageBucket = externalStorageBucket();
  if (!storageBucket) return null;

  try {
    if (process.env.STORAGE_FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.STORAGE_FIREBASE_SERVICE_ACCOUNT);
      const projectId = serviceAccount.project_id || externalStorageProjectId();
      if (!projectId) throw new Error('STORAGE_FIREBASE_PROJECT_ID is missing.');

      return initializeApp({
        credential: cert(serviceAccount),
        projectId,
        storageBucket,
      }, EXTERNAL_STORAGE_APP_NAME);
    }

    const projectId = externalStorageProjectId();
    const clientEmail = process.env.STORAGE_FIREBASE_CLIENT_EMAIL || '';
    const privateKey = process.env.STORAGE_FIREBASE_PRIVATE_KEY || '';

    if (!projectId || !clientEmail || !privateKey) return null;

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: normalizePrivateKey(privateKey),
      }),
      projectId,
      storageBucket,
    }, EXTERNAL_STORAGE_APP_NAME);
  } catch (error) {
    console.error('Failed to initialize external Firebase Storage Admin:', error);
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(initFirebaseAdmin());
}

export function isExternalStorageConfigured(): boolean {
  return Boolean(initExternalStorageAdmin() && externalStorageBucket());
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

export function getExternalAdminStorage(): Storage {
  const app = initExternalStorageAdmin();
  if (!app) {
    throw new Error(
      'Firebase Storage project B chưa được cấu hình. Hãy thêm STORAGE_FIREBASE_BUCKET và Service Account của project Storage.'
    );
  }
  return getStorage(app);
}

export function getExternalStorageBucketName(): string {
  const bucket = externalStorageBucket();
  if (!bucket) throw new Error('Thiếu STORAGE_FIREBASE_BUCKET.');
  return bucket;
}
