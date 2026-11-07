// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentViewer } from '@/components/secret/attachment-viewer';
import type { AttachedFile } from '@/components/secret/viewer';
import { encodeContainer } from '@/lib/file-container';

const translate = (key: string) => key;
vi.mock('next-intl', () => ({ useTranslations: () => translate, useLocale: () => 'ru' }));

let root: Root;
let host: HTMLDivElement;
let attached: AttachedFile;
const images: HTMLImageElement[] = [];
const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
const drawImage = vi.fn();
const revoke = vi.fn();
const download = vi.fn();

beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => {
            const bitmap = { width: 6000, height: 4000, close: vi.fn() };
            bitmaps.push(bitmap);
            return bitmap;
        }),
    );
    vi.stubGlobal(
        'Image',
        class {
            naturalWidth = 6000;
            naturalHeight = 4000;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            constructor() {
                images.push(this as unknown as HTMLImageElement);
            }
        },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(download);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const key = new Uint8Array(32).fill(3);
    const encrypted = await encodeContainer(
        [1, 2].map((n) => ({
            meta: { filename: `${n}.png`, mime: 'image/png', size: 1 },
            bytes: new Uint8Array([n]),
        })),
        key,
    );
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, arrayBuffer: async () => encrypted.buffer })),
    );
    attached = {
        fileRef: { s3Key: 'f/test', keyB64: Buffer.from(key).toString('base64url') },
        signedGetUrl: 'https://storage.test/container',
        previewImage: true,
    };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    images.length = 0;
    bitmaps.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

async function render(file = attached) {
    await act(async () => root.render(createElement(AttachmentViewer, { file })));
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
    });
}

describe('attachment gallery', () => {
    it('renders every unrestricted image and offers each original for download', async () => {
        await render();
        expect(host.querySelectorAll('img')).toHaveLength(2);
        expect(host.querySelectorAll('canvas')).toHaveLength(0);
        const buttons = host.querySelectorAll('button');
        expect(buttons).toHaveLength(2);
        await act(async () => buttons[1].click());
        expect(download).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('uses bounded canvases, blocks the context menu and never offers downloads when restricted', async () => {
        await render({ ...attached, previewImage: false, restrictDownload: true });
        expect(host.querySelectorAll('img')).toHaveLength(0);
        expect(host.querySelectorAll('button')).toHaveLength(0);
        expect(images).toHaveLength(0);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(createImageBitmap).toHaveBeenCalledTimes(2);
        const canvases = host.querySelectorAll('canvas');
        expect(canvases).toHaveLength(2);
        expect(canvases[0].width).toBe(2048);
        expect(canvases[0].height).toBe(1365);
        expect(canvases[0].hidden).toBe(false);
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        canvases[0].dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(drawImage).toHaveBeenCalledTimes(2);
        for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
        await act(async () => root.render(null));
        expect(canvases[0].width).toBe(0);
    });

    it('allows retry after an image decode error without revealing download controls', async () => {
        vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Invalid image'));
        await render({ ...attached, restrictDownload: true });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('previewUnavailable');
        expect(host.textContent).not.toContain('download');
        await act(async () => host.querySelector('button')?.click());
        expect(fetch).toHaveBeenCalledOnce();
        expect(createImageBitmap).toHaveBeenCalledTimes(3);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('closes a bitmap that finishes decoding after unmount', async () => {
        let finish!: (bitmap: ImageBitmap) => void;
        vi.mocked(createImageBitmap).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        await render({ ...attached, restrictDownload: true });
        await act(async () => root.render(null));
        const bitmap = { width: 10, height: 10, close: vi.fn() };
        await act(async () => finish(bitmap as unknown as ImageBitmap));
        expect(bitmap.close).toHaveBeenCalledOnce();
        expect(drawImage).toHaveBeenCalledTimes(1);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('closes bitmaps even if canvas drawing fails', async () => {
        drawImage.mockImplementationOnce(() => {
            throw new Error('Canvas failed');
        });
        await render({ ...attached, restrictDownload: true });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('previewUnavailable');
        for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
    });

    it('keeps the temporary image URL fallback for restricted SVG', async () => {
        const encrypted = await encodeContainer(
            [
                {
                    meta: { filename: 'test.svg', mime: 'image/svg+xml', size: 1 },
                    bytes: new Uint8Array([1]),
                },
            ],
            new Uint8Array(32).fill(3),
        );
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => encrypted.buffer } as Response);
        await render({ ...attached, restrictDownload: true });
        expect(createImageBitmap).not.toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        await act(async () => images[0].onload?.(new Event('load')));
        expect(host.querySelector('canvas')?.hidden).toBe(false);
        expect(revoke).toHaveBeenCalledOnce();
        expect(host.textContent).not.toContain('download');
    });

    it('keeps an unpreviewed attachment lazy until requested', async () => {
        await render({ ...attached, previewImage: false });
        expect(fetch).not.toHaveBeenCalled();
        await act(async () => host.querySelector('button')?.click());
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
        });
        expect(host.querySelectorAll('button')).toHaveLength(2);
        expect(fetch).toHaveBeenCalledOnce();
        expect(download).not.toHaveBeenCalled();
    });

    it('retries failed container loads without exposing a restricted download', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
        const file = { ...attached, restrictDownload: true };
        await render(file);
        expect(host.textContent).toContain('offline');
        expect(host.textContent).not.toContain('download');
        await act(async () => host.querySelector('button')?.click());
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
        });
        expect(host.querySelectorAll('canvas')).toHaveLength(2);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
