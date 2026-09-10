import crypto from 'crypto';

export type TokenDecryptSource =
  | 'primary-server'
  | 'legacy-server'
  | 'browser-vault';

export interface TokenDecryptResult {
  plainText: string;
  source: TokenDecryptSource;
}

function clean(value: unknown): string {
  return String(value || '').trim();
}

/**
 * Current production key. New writes always use this key first.
 */
export function getPrimaryServerTokenKey(): string {
  return clean(process.env.TOKEN_ENCRYPTION_KEY) || clean(process.env.META_APP_SECRET);
}

/**
 * Try every server-side key we may historically have used.
 *
 * Important: AI Studio may have encrypted with META_APP_SECRET while Vercel
 * later has TOKEN_ENCRYPTION_KEY configured. Previous code only tried the
 * first non-empty value, making those valid tokens unreadable in production.
 */
function getServerKeyCandidates(): Array<{ key: string; source: TokenDecryptSource }> {
  const primary = getPrimaryServerTokenKey();
  const candidates: Array<{ key: string; source: TokenDecryptSource }> = [];

  const tokenKey = clean(process.env.TOKEN_ENCRYPTION_KEY);
  const metaSecret = clean(process.env.META_APP_SECRET);

  if (tokenKey) {
    candidates.push({
      key: tokenKey,
      source: primary === tokenKey ? 'primary-server' : 'legacy-server',
    });
  }

  if (metaSecret && !candidates.some(item => item.key === metaSecret)) {
    candidates.push({
      key: metaSecret,
      source: primary === metaSecret ? 'primary-server' : 'legacy-server',
    });
  }

  return candidates;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptWithKeyMaterial(cipherText: string, keyMaterial: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) throw new Error('Dữ liệu token mã hóa không hợp lệ.');

  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(keyMaterial),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function encryptToken(plainText: string, keyMaterial?: string): string {
  if (!plainText) return '';

  // New writes are server-portable whenever a server key exists.
  const secret = getPrimaryServerTokenKey() || clean(keyMaterial);
  if (!secret) {
    throw new Error(
      'Không có khóa mã hóa. Hãy cấu hình TOKEN_ENCRYPTION_KEY hoặc META_APP_SECRET.'
    );
  }

  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

/**
 * Returns not only the plaintext but also which key family succeeded, allowing
 * callers to migrate legacy ciphertext to the current production key.
 */
export function decryptTokenDetailed(
  cipherText: string,
  keyMaterial?: string
): TokenDecryptResult {
  if (!cipherText) return { plainText: '', source: 'primary-server' };

  const candidates = getServerKeyCandidates();
  const browserVault = clean(keyMaterial);

  if (
    browserVault &&
    !candidates.some(item => item.key === browserVault)
  ) {
    candidates.push({ key: browserVault, source: 'browser-vault' });
  }

  if (candidates.length === 0) {
    throw new Error(
      'Không có khóa giải mã. Hãy cấu hình TOKEN_ENCRYPTION_KEY hoặc META_APP_SECRET.'
    );
  }

  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return {
        plainText: decryptWithKeyMaterial(cipherText, candidate.key),
        source: candidate.source,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error(
    'Không giải mã được token bằng TOKEN_ENCRYPTION_KEY, META_APP_SECRET hoặc khóa trình duyệt hiện tại.'
  );
  (error as any).cause = lastError;
  throw error;
}

/**
 * Backwards-compatible API used by the rest of the project.
 */
export function decryptToken(cipherText: string, keyMaterial?: string): string {
  return decryptTokenDetailed(cipherText, keyMaterial).plainText;
}
