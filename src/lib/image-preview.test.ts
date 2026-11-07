import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImageBitmap } from '@/lib/image-preview';

vi.mock('heic-to/next', () => ({ isHeic: vi.fn(), heicTo: vi.fn() }));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe('URL-free image decoding', () => {
    it('passes native raster bytes directly to the browser decoder', async () => {
        const bitmap = { width: 10, height: 10, close: vi.fn() };
        const decode = vi.fn().mockResolvedValue(bitmap);
        vi.stubGlobal('createImageBitmap', decode);
        const blob = new Blob(['image'], { type: 'image/png' });
        expect(await decodeImageBitmap(blob, { type: blob.type, name: 'a.png' })).toBe(bitmap);
        expect(decode).toHaveBeenCalledWith(blob);
    });

    it('uses the HEIC bitmap decoder without creating a JPEG or image URL', async () => {
        const { isHeic, heicTo } = await import('heic-to/next');
        const bitmap = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
        vi.mocked(isHeic).mockResolvedValue(true);
        vi.mocked(heicTo).mockResolvedValue(bitmap as never);
        const blob = new Blob(['heic']);
        expect(await decodeImageBitmap(blob, { type: '', name: 'a.heic' })).toBe(bitmap);
        expect(heicTo).toHaveBeenCalledWith({ blob: expect.any(File), type: 'bitmap' });
    });

    it('rejects a false HEIC extension before conversion', async () => {
        const { isHeic, heicTo } = await import('heic-to/next');
        vi.mocked(isHeic).mockResolvedValue(false);
        await expect(decodeImageBitmap(new Blob(['bad']), { type: '', name: 'a.heic' })).rejects.toThrow(
            'Invalid HEIC',
        );
        expect(heicTo).not.toHaveBeenCalled();
    });
});
