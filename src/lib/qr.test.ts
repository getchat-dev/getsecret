import { describe, expect, it } from 'vitest';
import { renderQrPngDataUrl, renderQrSvg } from './qr';

const SHORT = 'https://example.com';
const LONG_FRAGMENT = `https://burnotes.test/en/s/k4n9x2ppqlmt#${'a'.repeat(43)}`;

describe('renderQrSvg', () => {
    it('returns an SVG document for short input', async () => {
        const svg = await renderQrSvg(SHORT);
        expect(svg.startsWith('<?xml') || svg.startsWith('<svg')).toBe(true);
        expect(svg.includes('<svg')).toBe(true);
        expect(svg.includes('</svg>')).toBe(true);
    });

    it('produces a larger SVG for longer input (more modules)', async () => {
        const small = await renderQrSvg(SHORT);
        const big = await renderQrSvg(LONG_FRAGMENT);
        expect(big.length).toBeGreaterThan(small.length);
    });

    it('honors custom dark/light colors via render options', async () => {
        const svg = await renderQrSvg(SHORT, { color: { dark: '#112233ff', light: '#ffffff00' } });
        expect(svg).toContain('#112233');
    });
});

describe('renderQrPngDataUrl', () => {
    it('returns a base64 PNG data URL', async () => {
        const url = await renderQrPngDataUrl(SHORT);
        expect(url.startsWith('data:image/png;base64,')).toBe(true);
        expect(url.length).toBeGreaterThan('data:image/png;base64,'.length);
    });

    it('encodes a long full URL with key fragment without throwing', async () => {
        const url = await renderQrPngDataUrl(LONG_FRAGMENT);
        expect(url.startsWith('data:image/png;base64,')).toBe(true);
    });
});
