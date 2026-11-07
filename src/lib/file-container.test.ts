import { describe, expect, it } from 'vitest';
import {
    decodeContainer,
    encodeContainer,
    FILE_CONTAINER_KEY_BYTES,
    FILE_CONTAINER_VERSION,
    type FileMeta,
} from '@/lib/file-container';

const META: FileMeta = { filename: 'report.pdf', mime: 'application/pdf', size: 11 };
const HELLO = new TextEncoder().encode('hello world');

function randomKey(): Uint8Array<ArrayBuffer> {
    return crypto.getRandomValues(new Uint8Array(FILE_CONTAINER_KEY_BYTES));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
    // crypto.getRandomValues is capped at 65536 bytes per call by the Web Crypto spec.
    const out = new Uint8Array(length);
    const chunkSize = 65536;
    for (let offset = 0; offset < length; offset += chunkSize) {
        crypto.getRandomValues(out.subarray(offset, Math.min(offset + chunkSize, length)));
    }
    return out;
}

describe('file-container', () => {
    it('round-trips a file with its metadata', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);
        const decoded = await decodeContainer(container, key);

        expect(decoded[0].meta).toEqual(META);
        expect(Array.from(decoded[0].bytes)).toEqual(Array.from(HELLO));
    });

    it('round-trips bytes from an ArrayBuffer', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO.buffer), meta: META }], key);
        const decoded = await decodeContainer(container, key);

        expect(Array.from(decoded[0].bytes)).toEqual(Array.from(HELLO));
    });

    it('embeds the magic + version in the framing header', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);

        expect(container[0]).toBe(0x42); // 'B'
        expect(container[1]).toBe(0x4e); // 'N'
        expect(container[2]).toBe(0x31); // '1'
        expect(container[3]).toBe(FILE_CONTAINER_VERSION);
    });

    it('handles an empty file', async () => {
        const key = randomKey();
        const meta: FileMeta = { filename: 'empty.bin', mime: 'application/octet-stream', size: 0 };
        const container = await encodeContainer([{ bytes: new Uint8Array(new Uint8Array(0)), meta: meta }], key);
        const decoded = await decodeContainer(container, key);

        expect(decoded[0].meta).toEqual(meta);
        expect(decoded[0].bytes.length).toBe(0);
    });

    it('preserves every byte value in the file body', async () => {
        const key = randomKey();
        const all = new Uint8Array(256);
        for (let i = 0; i < 256; i += 1) all[i] = i;
        const meta: FileMeta = { filename: 'all.bin', mime: 'application/octet-stream', size: 256 };

        const container = await encodeContainer([{ bytes: new Uint8Array(all), meta: meta }], key);
        const decoded = await decodeContainer(container, key);

        expect(Array.from(decoded[0].bytes)).toEqual(Array.from(all));
    });

    it('handles a 1 MiB file', async () => {
        const key = randomKey();
        const big = randomBytes(1024 * 1024);
        const meta: FileMeta = { filename: 'blob.bin', mime: 'application/octet-stream', size: big.length };

        const container = await encodeContainer([{ bytes: new Uint8Array(big), meta: meta }], key);
        const decoded = await decodeContainer(container, key);

        expect(decoded[0].bytes.length).toBe(big.length);
        expect(Array.from(decoded[0].bytes.subarray(0, 64))).toEqual(Array.from(big.subarray(0, 64)));
        expect(Array.from(decoded[0].bytes.subarray(big.length - 64))).toEqual(
            Array.from(big.subarray(big.length - 64)),
        );
    });

    it('preserves unicode in filename and MIME', async () => {
        const key = randomKey();
        const meta: FileMeta = { filename: 'договор.pdf', mime: 'application/pdf; charset=utf-8', size: 11 };

        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: meta }], key);
        const decoded = await decodeContainer(container, key);

        expect(decoded[0].meta).toEqual(meta);
    });

    it('rejects a container with bad magic', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);
        container[0] = 0;

        await expect(decodeContainer(container, key)).rejects.toThrow(/magic/);
    });

    it('rejects an unsupported version', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);
        container[3] = 0x99;

        await expect(decodeContainer(container, key)).rejects.toThrow(/version/);
    });

    it('rejects a tampered IV', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);
        container[4] ^= 0xff;

        await expect(decodeContainer(container, key)).rejects.toThrow(/decryption failed/);
    });

    it('rejects a tampered ciphertext byte', async () => {
        const key = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], key);
        container[container.length - 1] ^= 0xff;

        await expect(decodeContainer(container, key)).rejects.toThrow(/decryption failed/);
    });

    it('rejects decryption with the wrong key', async () => {
        const k1 = randomKey();
        const k2 = randomKey();
        const container = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], k1);

        await expect(decodeContainer(container, k2)).rejects.toThrow(/decryption failed/);
    });

    it('rejects a container shorter than the framing header + auth tag', async () => {
        const key = randomKey();

        await expect(decodeContainer(new Uint8Array(15), key)).rejects.toThrow(/too short/);
        await expect(decodeContainer(new Uint8Array(31), key)).rejects.toThrow(/too short/);
    });

    it('rejects encode and decode with an invalid key length', async () => {
        const shortKey = new Uint8Array(16);
        await expect(encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], shortKey)).rejects.toThrow(
            /key length/,
        );

        const validKey = randomKey();
        const valid = await encodeContainer([{ bytes: new Uint8Array(HELLO), meta: META }], validKey);
        await expect(decodeContainer(valid, shortKey)).rejects.toThrow(/key length/);
    });
});

// Independent writer for legacy fixtures and authenticated but malformed headers.
async function fixture(header: unknown, body: Uint8Array<ArrayBuffer>, version = 2) {
    const key = randomKey();
    const json = new TextEncoder().encode(JSON.stringify(header));
    const inner = new Uint8Array(4 + json.length + body.length);
    new DataView(inner.buffer).setUint32(0, json.length);
    inner.set(json, 4);
    inner.set(body, 4 + json.length);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const imported = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, imported, inner));
    return { key, container: new Uint8Array([0x42, 0x4e, 0x31, version, ...iv, ...encrypted]) };
}

describe('multi-file containers', () => {
    it('reads an existing v1 file', async () => {
        const { key, container } = await fixture(META, HELLO, 1);
        expect(await decodeContainer(container, key)).toEqual([{ meta: META, bytes: HELLO }]);
    });

    it('round-trips 20 files including duplicate names and empty files in order', async () => {
        const key = randomKey();
        const files = Array.from({ length: 20 }, (_, size) => ({
            meta: { filename: 'same.png', mime: 'image/png', size },
            bytes: new Uint8Array(size).fill(size),
        }));
        const container = await encodeContainer(files, key);
        expect(await decodeContainer(container, key)).toEqual(files);
    });

    it('checks counts and metadata before encoding', async () => {
        const key = randomKey();
        await expect(encodeContainer([], key)).rejects.toThrow(/count/);
        await expect(encodeContainer(Array(21).fill({ meta: META, bytes: HELLO }), key)).rejects.toThrow(/count/);
        await expect(encodeContainer([{ meta: { ...META, size: 1 }, bytes: HELLO }], key)).rejects.toThrow(/size/);
        await expect(
            encodeContainer([{ meta: { ...META, filename: 'a'.repeat(21000) }, bytes: HELLO }], key),
        ).rejects.toThrow(/header/);
    });

    it.each(
        [
            [],
            Array(21).fill(META),
            [{ ...META, size: -1 }],
            [{ ...META, size: 0.5 }],
            [{ ...META, size: Number.MAX_SAFE_INTEGER + 1 }],
            [{ ...META, size: 12 }],
            [{ ...META, size: 10 }],
            META,
        ].map((header) => ({ header })),
    )('rejects malformed authenticated metadata %#', async ({ header }) => {
        const { key, container } = await fixture(header, HELLO);
        await expect(decodeContainer(container, key)).rejects.toThrow();
    });
});
