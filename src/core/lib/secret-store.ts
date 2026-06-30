import crypto from 'crypto';
import { auth } from '@/config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  return crypto.createHash('sha256').update(auth.secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
    ':'
  );
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const [ivPart, authTagPart, encryptedPart] = value.split(':');
  if (!ivPart || !authTagPart || !encryptedPart) {
    return null;
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function maskConfiguredSecret(isConfigured: boolean): string {
  return isConfigured ? 'Saved and hidden' : 'Not configured';
}
