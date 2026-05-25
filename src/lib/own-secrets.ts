// Tracks secrets created by THIS browser, so the viewer can warn the user
// "you're about to open your own secret — clicking Reveal will burn it for
// the recipient". Local-only safety net; it doesn't (and can't) catch a
// sender who opens the link from another browser, incognito, or another
// device. Stored in localStorage as `{ [secretId]: expiresAtMs }`.
//
// Privacy note: we only store the *id*, not the URL fragment key. The id
// alone cannot open the secret, so a forensic dump of localStorage doesn't
// leak plaintext. Records auto-expire from local storage at the same time
// the server-side secret expires.

const STORAGE_KEY = 'burnotes:mine';
// Hard cap so a heavy user creating dozens of secrets a day doesn't fill
// localStorage indefinitely. Far above any realistic working set.
const MAX_ENTRIES = 500;

type OwnSecretMap = Record<string, number>;

function isStorageAvailable(): boolean {
    try {
        return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
        // Some browsers throw SecurityError on `window.localStorage` access
        // when cookies/storage are blocked (e.g. privacy-strict Safari modes).
        return false;
    }
}

function read(): OwnSecretMap {
    if (!isStorageAvailable()) return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: OwnSecretMap = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        }
        return out;
    } catch {
        // Corrupt JSON or storage errors — start fresh rather than crashing.
        return {};
    }
}

function write(map: OwnSecretMap): void {
    if (!isStorageAvailable()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Quota exceeded, disabled storage, private mode — silently noop.
        // Worst case the warning won't show; not a correctness issue.
    }
}

// Drop entries whose server-side TTL has already elapsed, plus apply the
// hard cap. Cap-trim keeps the most-recently-expiring entries (i.e. the
// freshest secrets) on the theory that a user is more likely to re-visit
// something they created recently.
function compact(map: OwnSecretMap): OwnSecretMap {
    const now = Date.now();
    const live = Object.entries(map).filter(([, expiresAt]) => expiresAt > now);
    if (live.length <= MAX_ENTRIES) return Object.fromEntries(live);
    live.sort(([, a], [, b]) => b - a); // newest expiry first
    return Object.fromEntries(live.slice(0, MAX_ENTRIES));
}

export function markOwnSecret(id: string, expiresAtMs: number): void {
    if (!id || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return;
    const map = read();
    map[id] = expiresAtMs;
    write(compact(map));
}

export function isOwnSecret(id: string): boolean {
    if (!id) return false;
    const map = read();
    const expiresAt = map[id];
    return typeof expiresAt === 'number' && expiresAt > Date.now();
}

export function forgetOwnSecret(id: string): void {
    if (!id) return;
    const map = read();
    if (!(id in map)) return;
    delete map[id];
    write(map);
}
