// Encrypted container for file attachments. The container is an opaque blob
// uploaded to S3; the server never sees the file contents, the original
// filename, or the MIME type — those are encrypted inside the container's
// inner plaintext along with the file body.
//
// Wire layout (all big-endian, no padding):
//
//   offset  size   content
//   ──────  ─────  ──────────────────────────────────────────────
//   0       3      "BN1" magic
//   3       1      version (0x01)
//   4       12     AES-GCM IV
//   16      ?      AES-GCM(K_file, iv, inner_plaintext) — includes 16B auth tag
//
// Inner plaintext (decrypted):
//
//   offset  size       content
//   ──────  ─────────  ───────────────────────────────────────
//   0       4          header_len (uint32, BE)
//   4       header_len JSON metadata { filename, mime, size }
//   ?       remainder  raw file bytes

const MAGIC = new Uint8Array([0x42, 0x4e, 0x31]); // "BN1"
const VERSION = 0x01;
const IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const HEADER_LEN_BYTES = 4;
const FRAME_HEADER_BYTES = MAGIC.length + 1 + IV_BYTES; // 16
const MIN_CONTAINER_BYTES = FRAME_HEADER_BYTES + AES_GCM_TAG_BYTES; // 32

// File metadata is small (filename + MIME + size). 1 KiB cap blocks any
// pathological inner plaintext that would otherwise force us to allocate
// gigabytes for a JSON header before we even look at the file body.
const MAX_HEADER_BYTES = 1024;

export const FILE_CONTAINER_KEY_BYTES = 32;
export const FILE_CONTAINER_VERSION = VERSION;

export type FileMeta = {
    filename: string;
    mime: string;
    size: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function encodeContainer(
    fileBytes: ArrayBuffer | Uint8Array,
    meta: FileMeta,
    keyBytes: Uint8Array,
): Promise<Uint8Array> {
    if (keyBytes.length !== FILE_CONTAINER_KEY_BYTES) {
        throw new Error('Invalid file container key length');
    }

    const headerJson = JSON.stringify({ filename: meta.filename, mime: meta.mime, size: meta.size });
    const headerBytes = textEncoder.encode(headerJson);
    if (headerBytes.length > MAX_HEADER_BYTES) {
        throw new Error('File container header too large');
    }

    const fileView = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
    const innerPlaintext = new Uint8Array(HEADER_LEN_BYTES + headerBytes.length + fileView.length);
    new DataView(innerPlaintext.buffer).setUint32(0, headerBytes.length, false);
    innerPlaintext.set(headerBytes, HEADER_LEN_BYTES);
    innerPlaintext.set(fileView, HEADER_LEN_BYTES + headerBytes.length);

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, innerPlaintext));

    const container = new Uint8Array(FRAME_HEADER_BYTES + ciphertext.length);
    container.set(MAGIC, 0);
    container[MAGIC.length] = VERSION;
    container.set(iv, MAGIC.length + 1);
    container.set(ciphertext, FRAME_HEADER_BYTES);

    return container;
}

export async function decodeContainer(
    container: Uint8Array,
    keyBytes: Uint8Array,
): Promise<{ meta: FileMeta; bytes: Uint8Array }> {
    if (keyBytes.length !== FILE_CONTAINER_KEY_BYTES) {
        throw new Error('Invalid file container key length');
    }
    if (container.length < MIN_CONTAINER_BYTES) {
        throw new Error('File container too short');
    }
    if (container[0] !== MAGIC[0] || container[1] !== MAGIC[1] || container[2] !== MAGIC[2]) {
        throw new Error('Bad file container magic');
    }
    const version = container[MAGIC.length];
    if (version !== VERSION) {
        throw new Error(`Unsupported file container version: ${version}`);
    }

    const iv = container.subarray(MAGIC.length + 1, FRAME_HEADER_BYTES);
    const ciphertext = container.subarray(FRAME_HEADER_BYTES);

    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    let innerPlaintext: Uint8Array;
    try {
        innerPlaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext));
    } catch {
        throw new Error('File container decryption failed');
    }

    if (innerPlaintext.length < HEADER_LEN_BYTES) {
        throw new Error('File container inner plaintext truncated');
    }
    const headerLen = new DataView(innerPlaintext.buffer, innerPlaintext.byteOffset, HEADER_LEN_BYTES).getUint32(
        0,
        false,
    );
    if (headerLen > MAX_HEADER_BYTES) {
        throw new Error('File container header too large');
    }
    if (HEADER_LEN_BYTES + headerLen > innerPlaintext.length) {
        throw new Error('File container header length overflows inner plaintext');
    }

    const headerBytes = innerPlaintext.subarray(HEADER_LEN_BYTES, HEADER_LEN_BYTES + headerLen);
    const bodyBytes = innerPlaintext.subarray(HEADER_LEN_BYTES + headerLen);

    let parsed: unknown;
    try {
        parsed = JSON.parse(textDecoder.decode(headerBytes));
    } catch {
        throw new Error('File container header is not valid JSON');
    }
    return { meta: validateMeta(parsed), bytes: bodyBytes };
}

function validateMeta(parsed: unknown): FileMeta {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('File container header is not an object');
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.filename !== 'string' || obj.filename.length === 0) {
        throw new Error('File container header missing filename');
    }
    if (typeof obj.mime !== 'string') {
        throw new Error('File container header missing mime');
    }
    if (typeof obj.size !== 'number' || !Number.isFinite(obj.size) || obj.size < 0) {
        throw new Error('File container header missing or invalid size');
    }
    return { filename: obj.filename, mime: obj.mime, size: obj.size };
}
