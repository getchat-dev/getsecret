import { defineRouting } from 'next-intl/routing';

// Other languages (de, es, fr, it, zh) are temporarily hidden from the switcher and routing
// while their long-form prose is missing — JSON UI strings and content scaffolding remain in
// the repo, ready to be re-enabled once each locale has authored MDX in src/content/.
export const routing = defineRouting({
    locales: ['en', 'ru'] as const,
    defaultLocale: 'en',
    localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
