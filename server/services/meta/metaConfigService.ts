import crypto from 'crypto';
import { Request } from 'express';
import { getDocument, setDocument } from '../firebaseRest.js';
import { decryptToken, encryptToken } from './metaTokenService.js';

const VAULT_HEADER = 'x-pagemanager-vault-key';
const DEFAULT_GRAPH_VERSION = 'v23.0';

export interface MetaConfigUser {
  id: string;
  idToken: string;
}

export interface MetaConfigSummary {
  configured: boolean;
  appId: string;
  appSecretConfigured: boolean;
  graphApiVersion: string;
  source: 'saved' | 'environment' | 'none';
  vaultKeyMatches?: boolean;
}

export interface ResolvedMetaConfig {
  appId: string;
  appSecret?: string;
  graphApiVersion: string;
  source: 'saved' | 'environment';
}

function validateAppId(value: string): string {
  const appId = String(value || '').trim();
  if (!/^\d{5,32}$/.test(appId)) {
    throw new Error('App ID không hợp lệ. Hãy nhập đúng ID ứng dụng Meta dạng số.');
  }
  return appId;
}

function normalizeGraphVersion(value?: string): string {
  const version = String(value || DEFAULT_GRAPH_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error('Graph API Version không hợp lệ. Ví dụ: v23.0');
  }
  return version;
}

export function getVaultKeyFromRequest(req: Request, required = true): string {
  const raw = req.headers[VAULT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const key = String(value || '').trim();

  if (!key) {
    if (required) {
      throw new Error('Thiếu khóa bảo mật trình duyệt. Hãy tải lại trang Cài đặt rồi lưu cấu hình Meta lại.');
    }
    return '';
  }

  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('Khóa bảo mật trình duyệt không hợp lệ.');
  }

  return key.toLowerCase();
}

function vaultFingerprint(vaultKey: string): string {
  return crypto.createHash('sha256').update(vaultKey).digest('hex').slice(0, 24);
}

async function getUserRecord(user: MetaConfigUser) {
  return getDocument<any>(user.idToken, 'users', user.id);
}

async function writeUserFields(user: MetaConfigUser, fields: Record<string, any>) {
  const existing = await getUserRecord(user);
  if (existing) {
    await setDocument(user.idToken, 'users', user.id, fields, true);
  } else {
    await setDocument(user.idToken, 'users', user.id, { uid: user.id, ...fields }, false);
  }
}

export async function getMetaConfigSummary(user: MetaConfigUser, vaultKey = ''): Promise<MetaConfigSummary> {
  const userRecord = await getUserRecord(user);
  const data = userRecord?.data || {};
  if (data.metaAppId) {
    const matches = !data.metaVaultKeyHash || (vaultKey ? data.metaVaultKeyHash === vaultFingerprint(vaultKey) : true);
    return {
      configured: Boolean(data.metaAppId && data.metaEncryptedAppSecret && matches),
      appId: String(data.metaAppId || ''),
      appSecretConfigured: Boolean(data.metaEncryptedAppSecret),
      graphApiVersion: normalizeGraphVersion(data.metaGraphApiVersion || DEFAULT_GRAPH_VERSION),
      source: 'saved',
      vaultKeyMatches: matches,
    };
  }

  const envAppId = String(process.env.META_APP_ID || '').trim();
  const envSecret = String(process.env.META_APP_SECRET || '').trim();
  if (envAppId) {
    return {
      configured: Boolean(envAppId && envSecret),
      appId: envAppId,
      appSecretConfigured: Boolean(envSecret),
      graphApiVersion: normalizeGraphVersion(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION),
      source: 'environment',
    };
  }

  return {
    configured: false,
    appId: '',
    appSecretConfigured: false,
    graphApiVersion: DEFAULT_GRAPH_VERSION,
    source: 'none',
  };
}

export async function resolveMetaConfig(
  user: MetaConfigUser,
  vaultKey = '',
  requireSecret = false
): Promise<ResolvedMetaConfig> {
  const userRecord = await getUserRecord(user);
  const data = userRecord?.data || {};

  if (data.metaAppId) {
    const result: ResolvedMetaConfig = {
      appId: validateAppId(data.metaAppId),
      graphApiVersion: normalizeGraphVersion(data.metaGraphApiVersion),
      source: 'saved',
    };

    if (requireSecret) {
      if (!data.metaEncryptedAppSecret) {
        throw new Error('App Secret chưa được lưu trong Cài đặt & Facebook.');
      }
      if (!vaultKey) {
        throw new Error('Thiếu khóa bảo mật trình duyệt để giải mã App Secret. Hãy lưu cấu hình Meta lại.');
      }
      try {
        result.appSecret = decryptToken(String(data.metaEncryptedAppSecret), vaultKey);
      } catch {
        throw new Error('Không giải mã được App Secret trên trình duyệt này. Hãy nhập lại App Secret và bấm Lưu cấu hình.');
      }
    }

    return result;
  }

  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  if (!appId || (requireSecret && !appSecret)) {
    throw new Error('Chưa cấu hình Meta App. Hãy nhập App ID và App Secret ngay trong trang Cài đặt & Facebook.');
  }

  return {
    appId: validateAppId(appId),
    appSecret: requireSecret ? appSecret : undefined,
    graphApiVersion: normalizeGraphVersion(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION),
    source: 'environment',
  };
}

export async function saveMetaConfig(
  user: MetaConfigUser,
  input: { appId: string; appSecret?: string; graphApiVersion?: string },
  vaultKey: string
): Promise<MetaConfigSummary> {
  const appId = validateAppId(input.appId);
  const graphApiVersion = normalizeGraphVersion(input.graphApiVersion);
  const existing = await getUserRecord(user);
  const data = existing?.data || {};
  const now = new Date().toISOString();
  const currentVaultHash = vaultFingerprint(vaultKey);
  const existingVaultMatches = !data.metaVaultKeyHash || data.metaVaultKeyHash === currentVaultHash;

  let encryptedAppSecret = existingVaultMatches ? (data.metaEncryptedAppSecret || '') : '';
  const newSecret = String(input.appSecret || '').trim();
  if (newSecret) {
    if (newSecret.length < 8) throw new Error('App Secret có vẻ không hợp lệ.');
    encryptedAppSecret = encryptToken(newSecret, vaultKey);
  }

  if (!encryptedAppSecret) {
    throw new Error(data.metaEncryptedAppSecret
      ? 'Khóa bảo mật trình duyệt đã thay đổi. Hãy nhập lại App Secret rồi lưu.'
      : 'Hãy nhập App Secret lần đầu trước khi lưu cấu hình Meta.');
  }

  await writeUserFields(user, {
    metaAppId: appId,
    metaEncryptedAppSecret: encryptedAppSecret,
    metaGraphApiVersion: graphApiVersion,
    metaVaultKeyHash: currentVaultHash,
    metaConfigUpdatedAt: now,
  });

  return {
    configured: true,
    appId,
    appSecretConfigured: true,
    graphApiVersion,
    source: 'saved',
    vaultKeyMatches: true,
  };
}

export async function deleteMetaConfig(user: MetaConfigUser): Promise<void> {
  await writeUserFields(user, {
    metaAppId: null,
    metaEncryptedAppSecret: null,
    metaGraphApiVersion: null,
    metaVaultKeyHash: null,
    metaConfigUpdatedAt: new Date().toISOString(),
  });
}
