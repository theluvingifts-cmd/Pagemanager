import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface FirebaseRuntimeConfig {
  apiKey: string;
  projectId: string;
  databaseId: string;
  storageBucket: string;
}

export interface FirebaseIdentity {
  uid: string;
  email?: string;
  displayName?: string;
}

export interface FirestoreRecord<T = Record<string, any>> {
  id: string;
  data: T;
}

let cachedConfig: FirebaseRuntimeConfig | null = null;

function readAppletConfig(): any {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.warn('Không thể đọc firebase-applet-config.json:', error);
  }
  return {};
}

function hasExternalFirebaseOverride(): boolean {
  return Boolean(
    String(
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      ''
    ).trim()
  );
}

export function getFirebaseRuntimeConfig(): FirebaseRuntimeConfig {
  if (cachedConfig) return cachedConfig;

  const applet = readAppletConfig();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    applet.projectId ||
    '';

  const apiKey =
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    applet.apiKey ||
    '';

  const databaseId =
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIRESTORE_DATABASE_ID ||
    (hasExternalFirebaseOverride() ? '(default)' : (applet.firestoreDatabaseId || '(default)'));

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    (hasExternalFirebaseOverride()
      ? (projectId ? `${projectId}.firebasestorage.app` : '')
      : (applet.storageBucket || (projectId ? `${projectId}.firebasestorage.app` : '')));

  cachedConfig = { apiKey, projectId, databaseId, storageBucket };
  return cachedConfig;
}

export function isFirebaseRestConfigured(): boolean {
  const cfg = getFirebaseRuntimeConfig();
  return Boolean(cfg.apiKey && cfg.projectId && cfg.databaseId);
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  let details = '';
  try {
    const body = await response.json();
    details = body?.error?.message || body?.error || body?.message || '';
  } catch {
    try {
      details = await response.text();
    } catch {}
  }
  const message = details ? `${fallback}: ${details}` : `${fallback} (HTTP ${response.status})`;
  const error = new Error(message);
  (error as any).status = response.status;
  return error;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  const { apiKey } = getFirebaseRuntimeConfig();
  if (!apiKey) {
    throw new Error('Firebase Web API Key chưa được cấu hình.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    throw await parseError(response, 'Firebase ID Token không hợp lệ hoặc đã hết hạn');
  }

  const data = await response.json();
  const account = data?.users?.[0];
  if (!account?.localId) {
    throw new Error('Không xác định được Firebase UID từ ID Token.');
  }

  return {
    uid: account.localId,
    email: account.email,
    displayName: account.displayName,
  };
}

function firestoreBaseUrl(): string {
  const { projectId, databaseId } = getFirebaseRuntimeConfig();
  if (!projectId) throw new Error('Firebase Project ID chưa được cấu hình.');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
}

function firestoreHeaders(idToken: string, json = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function encodeValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } };
  }
  return { stringValue: String(value) };
}

function encodeFields(data: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeValue(value)])
  );
}

function decodeValue(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue?.fields || {});
  if ('referenceValue' in value) return value.referenceValue;
  return null;
}

function decodeFields(fields: Record<string, any> = {}): Record<string, any> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])
  );
}

function decodeDocument<T = Record<string, any>>(document: any): FirestoreRecord<T> {
  const name = String(document?.name || '');
  const id = name.split('/').pop() || '';
  return {
    id,
    data: decodeFields(document?.fields || {}) as T,
  };
}

export async function getDocument<T = Record<string, any>>(
  idToken: string,
  collection: string,
  id: string
): Promise<FirestoreRecord<T> | null> {
  const response = await fetch(
    `${firestoreBaseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    { headers: firestoreHeaders(idToken, false) }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw await parseError(response, `Không thể đọc ${collection}/${id}`);
  return decodeDocument<T>(await response.json());
}

export async function queryDocuments<T = Record<string, any>>(
  idToken: string,
  collection: string,
  filters: Array<{ field: string; value: any }> = [],
  limit = 200
): Promise<Array<FirestoreRecord<T>>> {
  const query: any = {
    from: [{ collectionId: collection }],
    limit,
  };

  if (filters.length === 1) {
    query.where = {
      fieldFilter: {
        field: { fieldPath: filters[0].field },
        op: 'EQUAL',
        value: encodeValue(filters[0].value),
      },
    };
  } else if (filters.length > 1) {
    query.where = {
      compositeFilter: {
        op: 'AND',
        filters: filters.map(filter => ({
          fieldFilter: {
            field: { fieldPath: filter.field },
            op: 'EQUAL',
            value: encodeValue(filter.value),
          },
        })),
      },
    };
  }

  const { projectId, databaseId } = getFirebaseRuntimeConfig();
  const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:runQuery`;
  const response = await fetch(runQueryUrl, {
    method: 'POST',
    headers: firestoreHeaders(idToken),
    body: JSON.stringify({ structuredQuery: query }),
  });

  if (!response.ok) throw await parseError(response, `Không thể truy vấn collection ${collection}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row: any) => row.document)
    .map((row: any) => decodeDocument<T>(row.document));
}

export async function setDocument(
  idToken: string,
  collection: string,
  id: string,
  data: Record<string, any>,
  merge = false
): Promise<void> {
  const base = `${firestoreBaseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  const url = new URL(base);
  if (merge) {
    for (const field of Object.keys(data)) {
      url.searchParams.append('updateMask.fieldPaths', field);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: firestoreHeaders(idToken),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });

  if (!response.ok) throw await parseError(response, `Không thể ghi ${collection}/${id}`);
}

export async function updateDocument(
  idToken: string,
  collection: string,
  id: string,
  updates: Record<string, any>
): Promise<void> {
  await setDocument(idToken, collection, id, updates, true);
}

export async function createDocument(
  idToken: string,
  collection: string,
  data: Record<string, any>,
  preferredId?: string
): Promise<FirestoreRecord> {
  const id = preferredId || crypto.randomBytes(12).toString('hex');
  await setDocument(idToken, collection, id, { ...data, id }, false);
  return { id, data: { ...data, id } };
}

export async function deleteDocument(
  idToken: string,
  collection: string,
  id: string
): Promise<void> {
  const response = await fetch(
    `${firestoreBaseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: firestoreHeaders(idToken, false),
    }
  );

  if (!response.ok && response.status !== 404) {
    throw await parseError(response, `Không thể xóa ${collection}/${id}`);
  }
}

export async function uploadStorageObject(
  idToken: string,
  storagePath: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  const { storageBucket, projectId } = getFirebaseRuntimeConfig();

  const candidates = Array.from(new Set([
    storageBucket,
    projectId ? `${projectId}.firebasestorage.app` : '',
    projectId ? `${projectId}.appspot.com` : '',
  ].map(v => String(v || '').trim()).filter(Boolean)));

  if (!candidates.length) {
    throw new Error('Firebase Storage bucket chưa được cấu hình.');
  }

  const notFoundBuckets: string[] = [];

  for (const bucket of candidates) {
    const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: bytes,
    });

    if (response.ok) {
      return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}?alt=media`;
    }

    if (response.status === 404) {
      notFoundBuckets.push(bucket);
      continue;
    }

    throw await parseError(response, `Không thể tải tệp lên Firebase Storage (${bucket})`);
  }

  throw Object.assign(
    new Error(
      `Không tìm thấy Firebase Storage bucket. Đã thử: ${notFoundBuckets.join(', ')}. ` +
      'Hãy kiểm tra VITE_FIREBASE_STORAGE_BUCKET hoặc mở Firebase Console > Storage để khởi tạo bucket.'
    ),
    { status: 404 }
  );
}
