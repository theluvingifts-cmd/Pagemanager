import crypto from 'crypto';

function getServerKeyMaterial(): string {
  return String(
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.META_APP_SECRET ||
    ''
  ).trim();
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptWithKeyMaterial(cipherText: string, keyMaterial: string): string {
  const parts = cipherText.split(':');
  if (parts.length != 3) throw new Error('Dữ liệu token mã hóa không hợp lệ.');

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

/**
 * New encrypted secrets/tokens prefer the server-side key so the same
 * Firebase data can be used from AI Studio, Vercel and other browsers.
 *
 * keyMaterial is kept as a fallback for environments that do not have a
 * server encryption secret configured yet.
 */
export function encryptToken(plainText: string, keyMaterial?: string): string {
  if (!plainText) return '';

  const secret = getServerKeyMaterial() || String(keyMaterial || '').trim();
  if (!secret) {
    throw new Error('Không có khóa mã hóa. Hãy cấu hình TOKEN_ENCRYPTION_KEY hoặc META_APP_SECRET.');
  }

  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Backward-compatible decrypt:
 * 1) try the stable server-side key used by production;
 * 2) if that fails, try the legacy per-browser vault key.
 *
 * This lets newly reconnected Meta tokens work on every browser while old
 * browser-encrypted tokens still work on the browser that originally created
 * them until the account is reconnected once.
 */
export function decryptToken(cipherText: string, keyMaterial?: string): string {
  if (!cipherText) return '';

  const candidates = [
    getServerKeyMaterial(),
    String(keyMaterial || '').trim(),
  ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);

  if (candidates.length === 0) {
    throw new Error('Không có khóa giải mã. Hãy cấu hình TOKEN_ENCRYPTION_KEY hoặc META_APP_SECRET.');
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return decryptWithKeyMaterial(cipherText, candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const error = new Error('Không giải mã được token bằng khóa server hoặc khóa trình duyệt hiện tại.');
  (error as any).cause = lastError;
  throw error;
}
