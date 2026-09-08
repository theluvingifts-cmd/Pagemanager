import crypto from 'crypto';

function getEncryptionKey(keyMaterial?: string): Buffer {
  const secret = keyMaterial || process.env.TOKEN_ENCRYPTION_KEY || process.env.META_APP_SECRET;
  if (!secret) {
    throw new Error('Không có khóa mã hóa. Hãy lưu cấu hình Meta lại trong trang Cài đặt.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptToken(plainText: string, keyMaterial?: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(cipherText: string, keyMaterial?: string): string {
  if (!cipherText) return '';
  const parts = cipherText.split(':');
  if (parts.length !== 3) throw new Error('Dữ liệu token mã hóa không hợp lệ.');

  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(keyMaterial),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
