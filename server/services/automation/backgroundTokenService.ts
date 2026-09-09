import { decryptToken, encryptToken } from '../meta/metaTokenService.js';

export function getBackgroundEncryptionKey(): string {
  const value = String(
    process.env.AUTOMATION_ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.META_APP_SECRET ||
    ''
  ).trim();
  if (!value) {
    throw new Error('Thiếu AUTOMATION_ENCRYPTION_KEY hoặc TOKEN_ENCRYPTION_KEY để mã hóa token chạy nền.');
  }
  return value;
}

export function encryptBackgroundPageToken(pageToken: string): string {
  return encryptToken(pageToken, getBackgroundEncryptionKey());
}

export function decryptBackgroundPageToken(cipherText: string): string {
  return decryptToken(cipherText, getBackgroundEncryptionKey());
}
