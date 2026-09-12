import { ImageResponse } from 'next/og';
import { BRAND_ACCENT, BRAND_PAPER, FLAME_PATH } from '@/lib/brand';

// Home-screen icon for iOS. Apple composites its own rounded mask, so this one
// is drawn as a full-bleed square — a border radius here would show as a double
// corner once the OS clips it.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                background: BRAND_ACCENT,
            }}
        >
            <svg
                width="116"
                height="116"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke={BRAND_PAPER}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d={FLAME_PATH} />
            </svg>
        </div>,
        { ...size },
    );
}
