import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetOwnSecret, isOwnSecret, markOwnSecret } from '@/lib/own-secrets';

const HOUR_MS = 60 * 60 * 1000;
const STORAGE_KEY = 'burnotes:mine';

// Minimal in-memory localStorage shim. Vitest's default `node` environment
// has no Web Storage; we plant our own so the helper's `window.localStorage`
// access goes somewhere predictable. Cheaper than spinning up jsdom for two
// dozen sync read/writes.
function installFakeStorage() {
    const store = new Map<string, string>();
    const stub = {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? (store.get(key) as string) : null;
        },
        setItem(key: string, value: string) {
            store.set(key, String(value));
        },
        removeItem(key: string) {
            store.delete(key);
        },
        key(i: number) {
            return Array.from(store.keys())[i] ?? null;
        },
    };
    (globalThis as unknown as { window: { localStorage: typeof stub } }).window = { localStorage: stub };
    return stub;
}

describe('own-secrets storage', () => {
    let storage: ReturnType<typeof installFakeStorage>;

    beforeEach(() => {
        storage = installFakeStorage();
    });

    afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window;
    });

    it('marks and recognizes a fresh secret', () => {
        markOwnSecret('id-a', Date.now() + HOUR_MS);
        expect(isOwnSecret('id-a')).toBe(true);
    });

    it('does not recognize an unknown id', () => {
        markOwnSecret('id-a', Date.now() + HOUR_MS);
        expect(isOwnSecret('id-b')).toBe(false);
    });

    it('treats already-expired entries as not-own (filtered on read)', () => {
        // Bypass the markOwnSecret guard to plant an expired record directly,
        // simulating a secret created earlier whose TTL has elapsed.
        storage.setItem(STORAGE_KEY, JSON.stringify({ 'id-old': Date.now() - 1000 }));
        expect(isOwnSecret('id-old')).toBe(false);
    });

    it('refuses to mark a secret with a non-future expiry', () => {
        markOwnSecret('id-stale', Date.now() - 1);
        expect(isOwnSecret('id-stale')).toBe(false);
    });

    it('forgetOwnSecret removes a tracked id', () => {
        markOwnSecret('id-a', Date.now() + HOUR_MS);
        forgetOwnSecret('id-a');
        expect(isOwnSecret('id-a')).toBe(false);
    });

    it('survives a corrupt storage payload', () => {
        storage.setItem(STORAGE_KEY, 'not-json{');
        expect(isOwnSecret('id-a')).toBe(false);
        markOwnSecret('id-a', Date.now() + HOUR_MS);
        expect(isOwnSecret('id-a')).toBe(true);
    });

    it('compacts on write: drops expired entries from the persisted map', () => {
        storage.setItem(STORAGE_KEY, JSON.stringify({ 'id-old': Date.now() - 1000, 'id-fresh': Date.now() + HOUR_MS }));
        markOwnSecret('id-new', Date.now() + HOUR_MS);
        const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
        expect(stored).not.toHaveProperty('id-old');
        expect(stored).toHaveProperty('id-fresh');
        expect(stored).toHaveProperty('id-new');
    });

    it('no-ops when window is absent (SSR safe)', () => {
        delete (globalThis as unknown as { window?: unknown }).window;
        expect(() => markOwnSecret('id-a', Date.now() + HOUR_MS)).not.toThrow();
        expect(isOwnSecret('id-a')).toBe(false);
        expect(() => forgetOwnSecret('id-a')).not.toThrow();
    });
});
