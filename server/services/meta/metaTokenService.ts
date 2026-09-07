import crypto from 'crypto';

/**
 * Derives a 32-byte encryption key from environment variables.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.META_APP_SECRET || 'pagemanager_default_dev_secret_key_32_chars';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts an access token using AES-256-GCM.
 * Output format: iv_hex:authTag_hex:encrypted_hex
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 */
export function decryptToken(cipherText: string): string {
  if (!cipherText) return '';

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Dữ liệu token mã hóa không hợp lệ (Invalid cipher text format)');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
