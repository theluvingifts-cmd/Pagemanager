import fs from 'fs';
import path from 'path';
import { getApps, initializeApp, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

export function loadAppletConfig(): any {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

export function initFirebaseAdmin(): App | null {
  const currentApps = getApps();
  if (currentApps.length > 0) {
    return currentApps[0];
  }

  try {
    const appletConfig = loadAppletConfig();
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      appletConfig?.projectId ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      '';

    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET ||
      appletConfig?.storageBucket ||
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      (projectId ? `${projectId}.firebasestorage.app` : undefined);

    // Option 1: Service Account JSON string in environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket,
      });
    }

    // Option 2: Individual service account env variables
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      return initializeApp({
        credential: cert({
          projectId: projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        projectId,
        storageBucket,
      });
    }

    // Option 3: Application Default Credentials or Project ID
    if (projectId) {
      try {
        return initializeApp({
          credential: applicationDefault(),
          projectId,
          storageBucket,
        });
      } catch (e) {
        return initializeApp({
          projectId,
          storageBucket,
        });
      }
    }

    console.warn('Firebase Admin: No credentials or Project ID found.');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }

  return null;
}

export function isFirebaseAdminConfigured(): boolean {
  if (getApps().length > 0) return true;
  initFirebaseAdmin();
  if (getApps().length > 0) return true;
  const appletConfig = loadAppletConfig();
  return Boolean(appletConfig?.projectId);
}

export function getAdminAuth(): Auth {
  if (getApps().length === 0) initFirebaseAdmin();
  if (getApps().length === 0) throw new Error('Firebase Admin is not configured. Please provide Firebase credentials.');
  return getAuth();
}

export function getAdminDb(): Firestore {
  if (getApps().length === 0) initFirebaseAdmin();
  if (getApps().length === 0) throw new Error('Firebase Admin is not configured. Please provide Firebase credentials.');
  const app = getApps()[0];
  const appletConfig = loadAppletConfig();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig?.firestoreDatabaseId;
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export function getAdminStorage(): Storage {
  if (getApps().length === 0) initFirebaseAdmin();
  if (getApps().length === 0) throw new Error('Firebase Admin is not configured. Please provide Firebase credentials.');
  return getStorage();
}
