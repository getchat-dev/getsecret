import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { BRAND_ACCENT, BRAND_INK, BRAND_PAPER, FLAME_PATH, OG_IMAGE_SIZE } from '@/lib/brand';
import { SITE_NAME } from '@/lib/site-meta';

// Default social card for every page under /[locale]. site-meta.ts declares
// `twitter.card: 'summary_large_image'`, which needs a real 1200x630 image or the
// card renders empty — this file is what makes that declaration true.
export const alt = `${SITE_NAME} — encrypted one-time links`;
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Without this the route is rendered per request: the image depends only on the
// locale, and there are two of them, so both are baked at build time instead.
export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'meta' });

    return new ImageResponse(
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                width: '100%',
                height: '100%',
                padding: 80,
                background: BRAND_INK,
                // Satori has no radial-gradient; an off-axis linear one reads as the
                // same corner glow the site uses behind the submit button.
                backgroundImage: `linear-gradient(135deg, rgba(31, 138, 100, 0.22) 0%, rgba(10, 13, 18, 0) 55%)`,
                color: BRAND_PAPER,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 72,
                        height: 72,
                        borderRadius: 18,
                        background: BRAND_ACCENT,
                    }}
                >
                    <svg
                        width="42"
                        height="42"
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
                </div>
                {/* Satori has no monospace face loaded, so the card shows the
                    wordmark in the default font; the accent underscore is what
                    still reads as `get_secret` at thumbnail size. */}
                <div style={{ display: 'flex', fontSize: 40, letterSpacing: -0.5 }}>
                    <span style={{ color: BRAND_PAPER }}>get</span>
                    <span style={{ color: BRAND_ACCENT }}>_</span>
                    <span style={{ color: BRAND_PAPER }}>secret</span>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    fontSize: 62,
                    lineHeight: 1.15,
                    letterSpacing: -1.5,
                    // The tagline runs to ~55 characters in English and past 60 in
                    // Russian; the cap keeps the longest one off the bottom edge.
                    maxWidth: 900,
                }}
            >
                {t('tagline')}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: '#8b9bb0' }}>
                <div style={{ display: 'flex', width: 40, height: 3, background: BRAND_ACCENT }} />
                <span>AES-256-GCM · zero-knowledge · open source</span>
            </div>
        </div>,
        { ...size },
    );
}
