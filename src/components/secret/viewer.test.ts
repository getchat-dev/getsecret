// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Viewer } from '@/components/secret/viewer';
import { markOwnSecret } from '@/lib/own-secrets';
import { prepareSecretUpload } from '@/lib/secret-crypto';

const translate = (key: string) => key;
vi.mock('next-intl', () => ({ useTranslations: () => translate, useLocale: () => 'ru' }));
vi.mock('@/components/secret/burned-screen', () => ({ BurnedScreen: () => 'unavailable' }));

let host: HTMLDivElement;
let root: Root;
let id: string;
const expiresAt = Date.now() + 3_600_000;

beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn());
    const prepared = await prepareSecretUpload('test');
    id = prepared.id;
    window.location.hash = prepared.key;
    markOwnSecret(id, expiresAt);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.localStorage.clear();
    window.location.hash = '';
    vi.unstubAllGlobals();
});

async function render(maxViews: number | null, viewsUsed = 0) {
    await act(async () => {
        root.render(
            createElement(Viewer, {
                id,
                expiresAtUtc: new Date(expiresAt).toISOString(),
                maxViews,
                viewsUsed,
                passwordParams: null,
            }),
        );
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
    });
}

describe('own-secret warning', () => {
    it.each([
        { maxViews: null, viewsUsed: 12, warn: false, label: 'unlimitedReads' },
        { maxViews: 3, viewsUsed: 0, warn: false, label: 'readsRemaining' },
        { maxViews: 3, viewsUsed: 2, warn: true, label: 'burnsOnRead' },
        { maxViews: 1, viewsUsed: 0, warn: true, label: 'burnsOnRead' },
    ])(
        'warns only for the last available read: $maxViews / $viewsUsed',
        async ({ maxViews, viewsUsed, warn, label }) => {
            await render(maxViews, viewsUsed);
            expect(host.textContent).toContain(label);
            expect(host.textContent?.includes('ownSecretBody')).toBe(warn);
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it('does not show the sender warning to a recipient', async () => {
        window.localStorage.clear();
        await render(1);
        expect(host.textContent).toContain('burnsOnRead');
        expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it.each(['missing', 'mismatched'])('rejects a %s fragment before showing the warning', async (kind) => {
        if (kind === 'missing') window.location.hash = '';
        else window.location.hash = (await prepareSecretUpload('other')).key;
        await render(1);
        expect(host.textContent).toBe('unavailable');
        expect(fetch).not.toHaveBeenCalled();
    });
});
