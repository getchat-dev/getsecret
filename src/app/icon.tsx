import { ImageResponse } from 'next/og';
import { BRAND_ACCENT, BRAND_PAPER, FLAME_PATH } from '@/lib/brand';

// Generated favicon. Lives at the app root (not under [locale]) so it is served
// for every URL including /s/:id, where no locale segment applies.
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                background: BRAND_ACCENT,
                // ~22% of the box: the squircle reads as rounded at 32px and still
                // holds a corner at 16px, where most browsers actually draw it.
                borderRadius: 7,
            }}
        >
            <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke={BRAND_PAPER}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d={FLAME_PATH} />
            </svg>
        </div>,
        { ...size },
    );
}
