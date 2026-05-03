import {
    computePasswordVerifier,
    decodePasswordSalt,
    derivePasswordKey,
    encodePasswordSalt,
    generatePasswordSalt,
    hashPasswordVerifier,
    PASSWORD_PBKDF2_ITERATIONS,
    type PasswordParams,
} from '@/lib/password-derive';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SECRET_ID_LABEL = 'burnotes:secret-id:v1:';
const SECRET_ACCESS_TOKEN_LABEL = 'burnotes:access-token:v1:';
const AES_GCM_TAG_BYTES = 16;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const MAX_SECRET_LENGTH = 10_000;
export const SECRET_VERSION_V1 = 1;
export const SECRET_VERSION_V2 = 2;
export const SECRET_VERSION = SECRET_VERSION_V1;
export const SECRET_KEY_BYTES = 32;
export const SECRET_IV_BYTES = 12;
export const SECRET_DIGEST_BYTES = 32;
export const MAX_SECRET_BYTES = MAX_SECRET_LENGTH * 4;

export const SECRET_ID_LENGTH = base64UrlLengthForBytes(SECRET_DIGEST_BYTES);
export const SECRET_ACCESS_TOKEN_LENGTH = base64UrlLengthForBytes(SECRET_DIGEST_BYTES);
export const SECRET_IV_LENGTH = base64UrlLengthForBytes(SECRET_IV_BYTES);
// v2 ciphertext wraps an inner IV (12 bytes) + inner ciphertext (≤ MAX_SECRET_BYTES + tag) + outer tag.
const MAX_V2_INNER_BYTES = SECRET_IV_BYTES + MAX_SECRET_BYTES + AES_GCM_TAG_BYTES;
export const MAX_CIPHERTEXT_LENGTH = base64UrlLengthForBytes(
    Math.max(MAX_SECRET_BYTES + AES_GCM_TAG_BYTES, MAX_V2_INNER_BYTES + AES_GCM_TAG_BYTES),
);

export type EncryptedSecret = {
    version: 1 | 2;
    iv: string;
    ciphertext: string;
};

export type PreparedSecretUpload = {
    id: string;
    key: string;
    accessToken: string;
    encryptedSecret: EncryptedSecret;
};

export type PreparedSecretUploadWithPassword = PreparedSecretUpload & {
    passwordParams: PasswordParams;
    passwordVerifierHash: string;
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

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
    if (!BASE64URL_PATTERN.test(value)) {
        throw new Error('Invalid base64url payload');
    }

    const paddedValue = value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(paddedValue);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(digest);
}

async function deriveToken(label: string, keyBytes: Uint8Array): Promise<string> {
    return encodeBase64Url(await sha256(concatBytes(textEncoder.encode(label), keyBytes)));
}

async function importAesKey(keyBytes: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, usages);
}

function decodeSecretKey(secretKey: string): Uint8Array {
    const keyBytes = decodeBase64Url(secretKey);
    if (keyBytes.length !== SECRET_KEY_BYTES) {
        throw new Error('Invalid secret key');
    }

    return keyBytes;
}

function decodeIv(iv: string): Uint8Array {
    const ivBytes = decodeBase64Url(iv);
    if (ivBytes.length !== SECRET_IV_BYTES) {
        throw new Error('Invalid IV');
    }

    return ivBytes;
}

export function isValidSecretId(value: string): boolean {
    return value.length === SECRET_ID_LENGTH && BASE64URL_PATTERN.test(value);
}

export function isValidAccessToken(value: string): boolean {
    return value.length === SECRET_ACCESS_TOKEN_LENGTH && BASE64URL_PATTERN.test(value);
}

export function isValidEncryptedSecret(value: unknown): value is EncryptedSecret {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<EncryptedSecret>;
    return (
        (candidate.version === SECRET_VERSION_V1 || candidate.version === SECRET_VERSION_V2) &&
        typeof candidate.iv === 'string' &&
        candidate.iv.length === SECRET_IV_LENGTH &&
        BASE64URL_PATTERN.test(candidate.iv) &&
        typeof candidate.ciphertext === 'string' &&
        candidate.ciphertext.length > 0 &&
        candidate.ciphertext.length <= MAX_CIPHERTEXT_LENGTH &&
        BASE64URL_PATTERN.test(candidate.ciphertext)
    );
}

export function readSecretKeyFromHash(hash: string): string | null {
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
    return fragment.length > 0 ? fragment : null;
}

export async function deriveSecretId(secretKey: string): Promise<string> {
    return deriveToken(SECRET_ID_LABEL, decodeSecretKey(secretKey));
}

export async function deriveSecretAccessToken(secretKey: string): Promise<string> {
    return deriveToken(SECRET_ACCESS_TOKEN_LABEL, decodeSecretKey(secretKey));
}

export async function hashAccessToken(accessToken: string): Promise<string> {
    return encodeBase64Url(await sha256(textEncoder.encode(accessToken)));
}

export async function prepareSecretUpload(secret: string): Promise<PreparedSecretUpload> {
    const keyBytes = crypto.getRandomValues(new Uint8Array(SECRET_KEY_BYTES));
    const ivBytes = crypto.getRandomValues(new Uint8Array(SECRET_IV_BYTES));
    const encryptionKey = await importAesKey(keyBytes, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        encryptionKey,
        textEncoder.encode(secret),
    );

    return {
        id: await deriveToken(SECRET_ID_LABEL, keyBytes),
        key: encodeBase64Url(keyBytes),
        accessToken: await deriveToken(SECRET_ACCESS_TOKEN_LABEL, keyBytes),
        encryptedSecret: {
            version: SECRET_VERSION,
            iv: encodeBase64Url(ivBytes),
            ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
        },
    };
}

export async function decryptSecret(secretKey: string, encryptedSecret: EncryptedSecret): Promise<string> {
    if (!isValidEncryptedSecret(encryptedSecret)) {
        throw new Error('Unsupported secret payload');
    }
    if (encryptedSecret.version !== SECRET_VERSION_V1) {
        throw new Error('This secret requires a password to decrypt');
    }

    const keyBytes = decodeSecretKey(secretKey);
    const ciphertextBytes = decodeBase64Url(encryptedSecret.ciphertext);
    const encryptionKey = await importAesKey(keyBytes, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeIv(encryptedSecret.iv) },
        encryptionKey,
        ciphertextBytes,
    );

    return textDecoder.decode(plaintext);
}

// Password-protected upload: inner AES-GCM(plaintext) under PBKDF2-derived key,
// outer AES-GCM(iv_inner || inner) under the URL-fragment key. The server
// learns neither plaintext nor password — only salt, iterations, and a hash
// of a hash of the derived key (verifierHash). Compromising the database
// alone yields nothing actionable; an attacker still has to brute-force the
// password against PBKDF2 (600k iterations) AND survive the 5-attempt lockout.
export async function prepareSecretUploadWithPassword(
    secret: string,
    password: string,
    iterations: number = PASSWORD_PBKDF2_ITERATIONS,
): Promise<PreparedSecretUploadWithPassword> {
    const outerKeyBytes = crypto.getRandomValues(new Uint8Array(SECRET_KEY_BYTES));
    const outerIvBytes = crypto.getRandomValues(new Uint8Array(SECRET_IV_BYTES));
    const innerIvBytes = crypto.getRandomValues(new Uint8Array(SECRET_IV_BYTES));
    const saltBytes = generatePasswordSalt();
    const innerKeyBytes = await derivePasswordKey(password, saltBytes, iterations);

    const innerKey = await importAesKey(innerKeyBytes, ['encrypt']);
    const innerCiphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: innerIvBytes }, innerKey, textEncoder.encode(secret)),
    );
    const bundle = concatBytes(innerIvBytes, innerCiphertext);

    const outerKey = await importAesKey(outerKeyBytes, ['encrypt']);
    const outerCiphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: outerIvBytes }, outerKey, bundle),
    );

    const verifier = await computePasswordVerifier(innerKeyBytes);
    const passwordVerifierHash = await hashPasswordVerifier(verifier);

    return {
        id: await deriveToken(SECRET_ID_LABEL, outerKeyBytes),
        key: encodeBase64Url(outerKeyBytes),
        accessToken: await deriveToken(SECRET_ACCESS_TOKEN_LABEL, outerKeyBytes),
        encryptedSecret: {
            version: SECRET_VERSION_V2,
            iv: encodeBase64Url(outerIvBytes),
            ciphertext: encodeBase64Url(outerCiphertext),
        },
        passwordParams: {
            salt: encodePasswordSalt(saltBytes),
            iterations,
        },
        passwordVerifierHash,
    };
}

export async function decryptSecretWithPassword(
    secretKey: string,
    encryptedSecret: EncryptedSecret,
    password: string,
    passwordParams: PasswordParams,
): Promise<string> {
    if (!isValidEncryptedSecret(encryptedSecret)) {
        throw new Error('Unsupported secret payload');
    }
    if (encryptedSecret.version !== SECRET_VERSION_V2) {
        throw new Error('Secret payload is not password-protected');
    }

    const outerKeyBytes = decodeSecretKey(secretKey);
    const outerKey = await importAesKey(outerKeyBytes, ['decrypt']);
    const bundleBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeIv(encryptedSecret.iv) },
        outerKey,
        decodeBase64Url(encryptedSecret.ciphertext),
    );
    const bundle = new Uint8Array(bundleBuffer);
    if (bundle.length < SECRET_IV_BYTES + AES_GCM_TAG_BYTES) {
        throw new Error('Malformed inner bundle');
    }
    const innerIvBytes = bundle.subarray(0, SECRET_IV_BYTES);
    const innerCiphertext = bundle.subarray(SECRET_IV_BYTES);

    const saltBytes = decodePasswordSalt(passwordParams.salt);
    const innerKeyBytes = await derivePasswordKey(password, saltBytes, passwordParams.iterations);
    const innerKey = await importAesKey(innerKeyBytes, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: innerIvBytes }, innerKey, innerCiphertext);

    return textDecoder.decode(plaintext);
}

// Helper for the open path: derive the verifier client-side from password +
// stored params so the API can hash it and pass to the constant-time compare.
export async function deriveVerifierForOpen(password: string, passwordParams: PasswordParams): Promise<string> {
    const saltBytes = decodePasswordSalt(passwordParams.salt);
    const innerKeyBytes = await derivePasswordKey(password, saltBytes, passwordParams.iterations);
    return computePasswordVerifier(innerKeyBytes);
}
