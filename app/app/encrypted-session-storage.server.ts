import crypto from "node:crypto";
import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";

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

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = encoded.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted session value.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function encryptSession(session: Session): Session {
  if (!session.accessToken && !session.refreshToken) return session;
  const clone = new Session(session.toObject());
  if (session.accessToken) clone.accessToken = encrypt(session.accessToken);
  if (session.refreshToken) clone.refreshToken = encrypt(session.refreshToken);
  return clone;
}

function decryptSession(session: Session): Session {
  const needsAccessToken = session.accessToken?.startsWith(ENCRYPTED_PREFIX);
  const needsRefreshToken = session.refreshToken?.startsWith(ENCRYPTED_PREFIX);
  if (!needsAccessToken && !needsRefreshToken) return session;

  const clone = new Session(session.toObject());
  if (needsAccessToken) clone.accessToken = decrypt(session.accessToken!);
  if (needsRefreshToken) clone.refreshToken = decrypt(session.refreshToken!);
  return clone;
}

/**
 * Wraps an underlying SessionStorage (PrismaSessionStorage in
 * shopify.server.ts) to encrypt accessToken/refreshToken before they hit the
 * database, and decrypt them on the way back out. Everything else
 * (shop, scope, expiry, etc.) is stored as-is — none of it is a secret.
 */
export class EncryptingSessionStorage implements SessionStorage {
  constructor(private readonly inner: SessionStorage) {}

  storeSession(session: Session): Promise<boolean> {
    return this.inner.storeSession(encryptSession(session));
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const session = await this.inner.loadSession(id);
    return session ? decryptSession(session) : undefined;
  }

  deleteSession(id: string): Promise<boolean> {
    return this.inner.deleteSession(id);
  }

  deleteSessions(ids: string[]): Promise<boolean> {
    return this.inner.deleteSessions(ids);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const sessions = await this.inner.findSessionsByShop(shop);
    return sessions.map(decryptSession);
  }
}
