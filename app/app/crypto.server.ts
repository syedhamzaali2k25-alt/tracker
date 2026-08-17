import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTED_PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer {
  const key = process.env.SESSION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "Missing required environment variable: SESSION_ENCRYPTION_KEY. Access tokens are " +
        "encrypted at rest and this key is required to do that. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  const buffer = Buffer.from(key, "hex");
  if (buffer.length !== 32) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters.",
    );
  }
  return buffer;
}

/**
 * AES-256-GCM encryption for secrets at rest (session access/refresh tokens,
 * Google OAuth refresh tokens). Shared by encrypted-session-storage.server.ts
 * and google-account.server.ts so both use the same key and format.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = encoded.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted value.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
