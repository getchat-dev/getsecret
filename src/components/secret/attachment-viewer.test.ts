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
const drawImage = vi.fn();
const revoke = vi.fn();
const download = vi.fn();

beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
        await act(async () => {
            for (const image of images) image.onload?.(new Event('load'));
        });
        const canvases = host.querySelectorAll('canvas');
        expect(canvases).toHaveLength(2);
        expect(canvases[0].width).toBe(2048);
        expect(canvases[0].height).toBe(1365);
        expect(canvases[0].hidden).toBe(false);
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        canvases[0].dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(drawImage).toHaveBeenCalledTimes(2);
        expect(revoke).toHaveBeenCalledTimes(2);
        await act(async () => root.render(null));
        expect(canvases[0].width).toBe(0);
    });

    it('allows retry after an image decode error without revealing download controls', async () => {
        await render({ ...attached, restrictDownload: true });
        await act(async () => images[0].onerror?.(new Event('error')));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('previewUnavailable');
        expect(host.textContent).not.toContain('download');
        await act(async () => host.querySelector('button')?.click());
        expect(fetch).toHaveBeenCalledOnce();
        expect(images).toHaveLength(3);
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
