import { timingSafeEqual } from 'node:crypto';
import type { EncryptedSecret } from '@/lib/secret-crypto';

const SECRET_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type SecretRecord = {
    encryptedSecret: EncryptedSecret;
    accessTokenHash: string;
    expiresAt: number;
    failedAttempts: number;
};

function safeEqualStrings(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

class SecretStore {
    private readonly store = new Map<string, SecretRecord>();

    constructor() {
        const timer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
        timer.unref();
    }

    create(id: string, encryptedSecret: EncryptedSecret, accessTokenHash: string): { expiresAt: number } | null {
        this.cleanupExpired();

        if (this.store.has(id)) {
            return null;
        }

        const expiresAt = Date.now() + SECRET_TTL_MS;
        this.store.set(id, { encryptedSecret, accessTokenHash, expiresAt, failedAttempts: 0 });
        return { expiresAt };
    }

    getMetadata(id: string): { expiresAt: number } | null {
        this.cleanupExpired();

        const record = this.store.get(id);
        if (!record) {
            return null;
        }

        return { expiresAt: record.expiresAt };
    }

    consume(id: string, accessTokenHash: string): EncryptedSecret | null {
        this.cleanupExpired();

        const record = this.store.get(id);
        if (!record) {
            return null;
        }

        if (!safeEqualStrings(record.accessTokenHash, accessTokenHash)) {
            record.failedAttempts += 1;
            if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
                this.store.delete(id);
            }
            return null;
        }

        if (record.expiresAt <= Date.now()) {
            this.store.delete(id);
            return null;
        }

        this.store.delete(id);
        return record.encryptedSecret;
    }

    private cleanupExpired(): void {
        const now = Date.now();
        for (const [id, record] of this.store.entries()) {
            if (record.expiresAt <= now) {
                this.store.delete(id);
            }
        }
    }
}

declare global {
    // eslint-disable-next-line no-var
    var __secretStore: SecretStore | undefined;
}

export const secretStore = globalThis.__secretStore ?? new SecretStore();

globalThis.__secretStore = secretStore;

export const SECRET_TTL_SECONDS = SECRET_TTL_MS / 1000;
