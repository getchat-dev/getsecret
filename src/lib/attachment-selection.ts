import { containerSize, MAX_IMAGE_FILES } from '@/lib/file-container';
import { isImageCandidate } from '@/lib/image-preview';

export function remainingFileSlots(files: File[]): number {
    if (files.length === 0) return 1;
    return isImageCandidate(files[0]) ? Math.max(0, MAX_IMAGE_FILES - files.length) : 0;
}

export function attachmentSelectionError(
    current: File[],
    incoming: File[],
    maxBytes: number,
): 'attachmentCount' | 'imagesOnly' | 'fileTooLarge' | 'attachmentMetadata' | null {
    if (incoming.length > remainingFileSlots(current)) return 'attachmentCount';
    if (current.length && incoming.some((file) => !isImageCandidate(file))) return 'imagesOnly';
    const files = [...current, ...incoming];
    if (!files.length) return null;
    try {
        const size = containerSize(
            files.map((file) => ({
                filename: file.name || 'file',
                mime: file.type || 'application/octet-stream',
                size: file.size,
            })),
        );
        if (size > maxBytes) return 'fileTooLarge';
    } catch {
        return 'attachmentMetadata';
    }
    return null;
}
