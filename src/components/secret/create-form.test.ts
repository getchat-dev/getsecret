// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateForm } from '@/components/secret/create-form';

const translate = (key: string, values?: { filename?: string }) =>
    key === 'openImage' ? `${key} ${values?.filename}` : key;
vi.mock('next-intl', () => ({ useTranslations: () => translate, useLocale: () => 'ru' }));
vi.mock('@/components/secret/secret-name', () => ({ SecretName: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperties(HTMLDialogElement.prototype, {
        showModal: {
            configurable: true,
            value() {
                this.setAttribute('open', '');
            },
        },
        close: {
            configurable: true,
            value() {
                this.removeAttribute('open');
            },
        },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(CreateForm)));
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function choose(file: File) {
    const input = host.querySelector('input[type="file"]');
    if (!input) throw new Error('File picker missing');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

async function click(label: string) {
    const button = [...host.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => button.click());
}

describe('sender image previews', () => {
    it('opens local images, switches the gallery and keeps indices correct after removal', async () => {
        await choose(new File(['first'], 'first.png', { type: 'image/png' }));
        await choose(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
        await click('openImage second.jpg');
        expect(host.querySelector('dialog')?.open).toBe(true);
        expect(host.querySelector('dialog img')?.getAttribute('alt')).toBe('second.jpg');
        await click('previousImage');
        expect(host.querySelector('dialog img')?.getAttribute('alt')).toBe('first.png');
        await click('closeImage');
        await click('removeFile: first.png');
        await click('openImage second.jpg');
        expect(host.querySelector('dialog img')?.getAttribute('alt')).toBe('second.jpg');
        expect(host.querySelector('dialog [aria-label="nextImage"]')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('closes the lightbox when selection changes and does not offer it for other files', async () => {
        await choose(new File(['first'], 'first.png', { type: 'image/png' }));
        await click('openImage first.png');
        await choose(new File(['second'], 'second.png', { type: 'image/png' }));
        expect(host.querySelector('dialog')).toBeNull();
        expect(document.body.style.overflow).toBe('');
        await click('removeFile: first.png');
        await click('removeFile: second.png');
        await choose(new File(['text'], 'note.txt', { type: 'text/plain' }));
        expect(host.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});
