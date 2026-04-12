import crypto from 'node:crypto';

const SECRET_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

type SecretRecord = {
  value: string;
  expiresAt: number;
};

class SecretStore {
  private readonly store = new Map<string, SecretRecord>();

  constructor() {
    const timer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
    timer.unref();
  }

  create(secret: string): { id: string; expiresAt: number } {
    this.cleanupExpired();

    let id = this.generateId();
    while (this.store.has(id)) {
      id = this.generateId();
    }

    const expiresAt = Date.now() + SECRET_TTL_MS;
    this.store.set(id, { value: secret, expiresAt });
    return { id, expiresAt };
  }

  getMetadata(id: string): { expiresAt: number } | null {
    this.cleanupExpired();

    const record = this.store.get(id);
    if (!record) {
      return null;
    }

    return { expiresAt: record.expiresAt };
  }

  consume(id: string): string | null {
    this.cleanupExpired();

    const record = this.store.get(id);
    if (!record) {
      return null;
    }

    this.store.delete(id);

    if (record.expiresAt <= Date.now()) {
      return null;
    }

    return record.value;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.store.entries()) {
      if (record.expiresAt <= now) {
        this.store.delete(id);
      }
    }
  }

  private generateId(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __secretStore: SecretStore | undefined;
}

export const secretStore = globalThis.__secretStore ?? new SecretStore();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__secretStore = secretStore;
}

export const SECRET_TTL_SECONDS = SECRET_TTL_MS / 1000;
