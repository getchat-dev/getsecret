// Password key derivation and verifier helpers, isolated from secret-crypto for
// targeted unit testing. The verifier ↔ verifierHash chain mirrors the existing
// access-token ↔ accessTokenHash pattern: the client hashes K_inner once to
// produce the verifier (sent over the wire), the server hashes that once more
// to obtain the verifierHash (compared against storage in constant time inside
// the Lua script). Compromising the database alone yields only a hash of a
// hash — still requires the password to forge.

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

export const PASSWORD_PBKDF2_ITERATIONS = 600_000;
export const PASSWORD_MIN_ITERATIONS = 100_000;
export const PASSWORD_MAX_ITERATIONS = 1_000_000;
export const PASSWORD_SALT_BYTES = 16;
export const PASSWORD_KEY_BYTES = 32;
export const PASSWORD_VERIFIER_BYTES = 32;
export const PASSWORD_VERIFIER_DOMAIN_TAG = 'burnotes:verifier:v1';

export const PASSWORD_SALT_LENGTH = base64UrlLengthForBytes(PASSWORD_SALT_BYTES);
export const PASSWORD_VERIFIER_LENGTH = base64UrlLengthForBytes(PASSWORD_VERIFIER_BYTES);
export const PASSWORD_VERIFIER_HASH_LENGTH = base64UrlLengthForBytes(PASSWORD_VERIFIER_BYTES);

export type PasswordParams = {
    salt: string;
    iterations: number;
};

function base64UrlLengthForBytes(byteLength: number): number {
    return Math.ceil(byteLength / 3) * 4 - ((3 - (byteLength % 3)) % 3);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
    if (!BASE64URL_PATTERN.test(value)) {
        throw new Error('Invalid base64url payload');
    }
    const padded = value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(digest);
}

export function generatePasswordSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
}

export function encodePasswordSalt(saltBytes: Uint8Array): string {
    if (saltBytes.length !== PASSWORD_SALT_BYTES) {
        throw new Error('Invalid password salt length');
    }
    return encodeBase64Url(saltBytes);
}

export function decodePasswordSalt(saltBase64: string): Uint8Array {
    const bytes = decodeBase64Url(saltBase64);
    if (bytes.length !== PASSWORD_SALT_BYTES) {
        throw new Error('Invalid password salt');
    }
    return bytes;
}

export function isValidPasswordSalt(value: unknown): value is string {
    return typeof value === 'string' && value.length === PASSWORD_SALT_LENGTH && BASE64URL_PATTERN.test(value);
}

export function isValidPasswordIterations(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= PASSWORD_MIN_ITERATIONS &&
        value <= PASSWORD_MAX_ITERATIONS
    );
}

export function isValidPasswordParams(value: unknown): value is PasswordParams {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<PasswordParams>;
    return isValidPasswordSalt(candidate.salt) && isValidPasswordIterations(candidate.iterations);
}

export function isValidPasswordVerifier(value: unknown): value is string {
    return typeof value === 'string' && value.length === PASSWORD_VERIFIER_LENGTH && BASE64URL_PATTERN.test(value);
}

export function isValidPasswordVerifierHash(value: unknown): value is string {
    return typeof value === 'string' && value.length === PASSWORD_VERIFIER_HASH_LENGTH && BASE64URL_PATTERN.test(value);
}

export async function derivePasswordKey(
    password: string,
    saltBytes: Uint8Array,
    iterations: number,
): Promise<Uint8Array> {
    if (saltBytes.length !== PASSWORD_SALT_BYTES) {
        throw new Error('Invalid password salt length');
    }
    if (!isValidPasswordIterations(iterations)) {
        throw new Error('Invalid PBKDF2 iterations');
    }
    const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), { name: 'PBKDF2' }, false, [
        'deriveBits',
    ]);
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
        baseKey,
        PASSWORD_KEY_BYTES * 8,
    );
    return new Uint8Array(derived);
}

// verifier = SHA256(K_inner ‖ domainTag) — sent to the server in the open path.
export async function computePasswordVerifier(innerKeyBytes: Uint8Array): Promise<string> {
    if (innerKeyBytes.length !== PASSWORD_KEY_BYTES) {
        throw new Error('Invalid inner key length');
    }
    return encodeBase64Url(await sha256(concatBytes(innerKeyBytes, textEncoder.encode(PASSWORD_VERIFIER_DOMAIN_TAG))));
}

// verifierHash = SHA256(verifier_bytes) — what the server stores and what the
// /api/secrets/[id] handler hashes the incoming verifier into before passing
// to the constant-time compare in OPEN_SCRIPT.
export async function hashPasswordVerifier(verifierBase64: string): Promise<string> {
    return encodeBase64Url(await sha256(decodeBase64Url(verifierBase64)));
}
