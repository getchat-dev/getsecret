import type { QRCodeErrorCorrectionLevel } from 'qrcode';

export type QrRenderOptions = {
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
    scale?: number;
    color?: { dark?: string; light?: string };
};

const DEFAULTS = {
    errorCorrectionLevel: 'M' as QRCodeErrorCorrectionLevel,
    margin: 2,
    scale: 8,
} as const;

async function loadQrcode() {
    const mod = await import('qrcode');
    return mod.default ?? mod;
}

export async function renderQrSvg(text: string, options?: QrRenderOptions): Promise<string> {
    const qrcode = await loadQrcode();
    return qrcode.toString(text, {
        type: 'svg',
        errorCorrectionLevel: options?.errorCorrectionLevel ?? DEFAULTS.errorCorrectionLevel,
        margin: options?.margin ?? DEFAULTS.margin,
        ...(options?.color ? { color: options.color } : {}),
    });
}

export async function renderQrPngDataUrl(text: string, options?: QrRenderOptions): Promise<string> {
    const qrcode = await loadQrcode();
    return qrcode.toDataURL(text, {
        type: 'image/png',
        errorCorrectionLevel: options?.errorCorrectionLevel ?? DEFAULTS.errorCorrectionLevel,
        margin: options?.margin ?? DEFAULTS.margin,
        scale: options?.scale ?? DEFAULTS.scale,
        ...(options?.color ? { color: options.color } : {}),
    });
}
