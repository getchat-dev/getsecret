// Brand constants for the generated favicon and OG image.
//
// Those files render through Satori (`next/og`), which never sees the document
// and therefore cannot read the CSS custom properties in globals.css. The values
// below are a hand-kept mirror of --accent, --bg-0 (dark) and --accent-fg — change
// one side and change the other. `viewport.themeColor` in [locale]/layout.tsx
// mirrors --accent for the same reason.
export const BRAND_ACCENT = '#1f8a64';
export const BRAND_INK = '#0a0d12';
export const BRAND_PAPER = '#e6f7ef';

// FlameIcon's path from components/ui/icons.tsx, drawn on a 24x24 viewBox with a
// 2px round-capped stroke. Kept as a bare string so Satori can render it without
// pulling a client component into the image route.
export const FLAME_PATH =
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

// Canonical social-card dimensions. opengraph-image.tsx exports this as its
// `size`, and site-meta.ts states the same numbers in og:image:width/height —
// a crawler that trusts the tags and a crawler that measures the file have to
// agree.
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
