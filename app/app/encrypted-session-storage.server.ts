import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { decrypt, encrypt, isEncrypted } from "./crypto.server";

function encryptSession(session: Session): Session {
  if (!session.accessToken && !session.refreshToken) return session;
  const clone = new Session(session.toObject());
  if (session.accessToken) clone.accessToken = encrypt(session.accessToken);
  if (session.refreshToken) clone.refreshToken = encrypt(session.refreshToken);
  return clone;
}

function decryptSession(session: Session): Session {
  const needsAccessToken = session.accessToken ? isEncrypted(session.accessToken) : false;
  const needsRefreshToken = session.refreshToken ? isEncrypted(session.refreshToken) : false;
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
