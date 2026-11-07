import { describe, expect, it } from 'vitest';
import { attachmentSelectionError, remainingFileSlots } from '@/lib/attachment-selection';
import { containerSize } from '@/lib/file-container';

const image = new File(['123'], 'photo.png', { type: 'image/png' });
const pdf = new File(['123'], 'doc.pdf', { type: 'application/pdf' });
const limit = 25 * 1024 * 1024;

describe('attachment selection shared by picker, drop and paste', () => {
    it('starts with one file and then allows only the remaining image slots', () => {
        expect(remainingFileSlots([])).toBe(1);
        expect(attachmentSelectionError([], [image, image], limit)).toBe('attachmentCount');
        expect(attachmentSelectionError([], [pdf], limit)).toBeNull();
        expect(remainingFileSlots([pdf])).toBe(0);
        expect(attachmentSelectionError([pdf], [image], limit)).toBe('attachmentCount');
        expect(remainingFileSlots(Array(7).fill(image))).toBe(13);
        expect(attachmentSelectionError(Array(7).fill(image), Array(13).fill(image), limit)).toBeNull();
        expect(attachmentSelectionError(Array(7).fill(image), Array(14).fill(image), limit)).toBe('attachmentCount');
        expect(remainingFileSlots(Array(20).fill(image))).toBe(0);
        expect(remainingFileSlots(Array(19).fill(image))).toBe(1);
    });
    it('rejects mixed batches without partially adding them', () => {
        expect(attachmentSelectionError([image], [image, pdf], limit)).toBe('imagesOnly');
    });
    it('accounts for the encrypted framing and metadata in the total size', () => {
        const size = containerSize([{ filename: image.name, mime: image.type, size: image.size }]);
        expect(attachmentSelectionError([], [image], size)).toBeNull();
        expect(attachmentSelectionError([], [image], size - 1)).toBe('fileTooLarge');
    });
    it('accepts HEIC filenames without MIME and bounds metadata', () => {
        expect(remainingFileSlots([new File(['x'], 'photo.heic')])).toBe(19);
        expect(attachmentSelectionError([], [new File(['x'], 'x'.repeat(21000))], limit)).toBe('attachmentMetadata');
    });
});
