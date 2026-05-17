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

function randomKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(FILE_CONTAINER_KEY_BYTES));
}

function randomBytes(length: number): Uint8Array {
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
        const container = await encodeContainer(HELLO, META, key);
        const decoded = await decodeContainer(container, key);

        expect(decoded.meta).toEqual(META);
        expect(Array.from(decoded.bytes)).toEqual(Array.from(HELLO));
    });

    it('accepts ArrayBuffer input on encode', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO.buffer, META, key);
        const decoded = await decodeContainer(container, key);

        expect(Array.from(decoded.bytes)).toEqual(Array.from(HELLO));
    });

    it('embeds the magic + version in the framing header', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO, META, key);

        expect(container[0]).toBe(0x42); // 'B'
        expect(container[1]).toBe(0x4e); // 'N'
        expect(container[2]).toBe(0x31); // '1'
        expect(container[3]).toBe(FILE_CONTAINER_VERSION);
    });

    it('handles an empty file', async () => {
        const key = randomKey();
        const meta: FileMeta = { filename: 'empty.bin', mime: 'application/octet-stream', size: 0 };
        const container = await encodeContainer(new Uint8Array(0), meta, key);
        const decoded = await decodeContainer(container, key);

        expect(decoded.meta).toEqual(meta);
        expect(decoded.bytes.length).toBe(0);
    });

    it('preserves every byte value in the file body', async () => {
        const key = randomKey();
        const all = new Uint8Array(256);
        for (let i = 0; i < 256; i += 1) all[i] = i;
        const meta: FileMeta = { filename: 'all.bin', mime: 'application/octet-stream', size: 256 };

        const container = await encodeContainer(all, meta, key);
        const decoded = await decodeContainer(container, key);

        expect(Array.from(decoded.bytes)).toEqual(Array.from(all));
    });

    it('handles a 1 MiB file', async () => {
        const key = randomKey();
        const big = randomBytes(1024 * 1024);
        const meta: FileMeta = { filename: 'blob.bin', mime: 'application/octet-stream', size: big.length };

        const container = await encodeContainer(big, meta, key);
        const decoded = await decodeContainer(container, key);

        expect(decoded.bytes.length).toBe(big.length);
        expect(Array.from(decoded.bytes.subarray(0, 64))).toEqual(Array.from(big.subarray(0, 64)));
        expect(Array.from(decoded.bytes.subarray(big.length - 64))).toEqual(Array.from(big.subarray(big.length - 64)));
    });

    it('preserves unicode in filename and MIME', async () => {
        const key = randomKey();
        const meta: FileMeta = { filename: 'договор.pdf', mime: 'application/pdf; charset=utf-8', size: 11 };

        const container = await encodeContainer(HELLO, meta, key);
        const decoded = await decodeContainer(container, key);

        expect(decoded.meta).toEqual(meta);
    });

    it('rejects a container with bad magic', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO, META, key);
        container[0] = 0;

        await expect(decodeContainer(container, key)).rejects.toThrow(/magic/);
    });

    it('rejects an unsupported version', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO, META, key);
        container[3] = 0x99;

        await expect(decodeContainer(container, key)).rejects.toThrow(/version/);
    });

    it('rejects a tampered IV', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO, META, key);
        container[4] ^= 0xff;

        await expect(decodeContainer(container, key)).rejects.toThrow(/decryption failed/);
    });

    it('rejects a tampered ciphertext byte', async () => {
        const key = randomKey();
        const container = await encodeContainer(HELLO, META, key);
        container[container.length - 1] ^= 0xff;

        await expect(decodeContainer(container, key)).rejects.toThrow(/decryption failed/);
    });

    it('rejects decryption with the wrong key', async () => {
        const k1 = randomKey();
        const k2 = randomKey();
        const container = await encodeContainer(HELLO, META, k1);

        await expect(decodeContainer(container, k2)).rejects.toThrow(/decryption failed/);
    });

    it('rejects a container shorter than the framing header + auth tag', async () => {
        const key = randomKey();

        await expect(decodeContainer(new Uint8Array(15), key)).rejects.toThrow(/too short/);
        await expect(decodeContainer(new Uint8Array(31), key)).rejects.toThrow(/too short/);
    });

    it('rejects encode and decode with an invalid key length', async () => {
        const shortKey = new Uint8Array(16);
        await expect(encodeContainer(HELLO, META, shortKey)).rejects.toThrow(/key length/);

        const validKey = randomKey();
        const valid = await encodeContainer(HELLO, META, validKey);
        await expect(decodeContainer(valid, shortKey)).rejects.toThrow(/key length/);
    });
});
