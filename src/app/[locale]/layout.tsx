import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ClientLocaleProvider } from '@/components/layout/client-locale-provider';
import { NavShell } from '@/components/layout/nav-shell';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/theme-provider';
import { type Locale, routing } from '@/i18n/routing';
import { localeDirection } from '@/lib/locale-direction';
import { localizedAlternates, SITE_NAME, siteOrigin } from '@/lib/site-meta';
import '../globals.css';

// Root metadata for every page under /[locale]. Per-page `generateMetadata`
// overrides title/description/alternates as needed; everything not overridden
// (template, siteName, twitter card defaults, robots) falls back
// to what we set here.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'meta' });
    const tagline = t('tagline');
    const description = t('description');
    const alternates = localizedAlternates('/', locale);

    return {
        // metadataBase lets Next resolve relative URLs (OG/twitter images,
        // canonical) into absolutes. Required as of Next 14+.
        metadataBase: new URL(siteOrigin()),
        applicationName: SITE_NAME,
        title: {
            template: `%s · ${SITE_NAME}`,
            default: `${SITE_NAME} — ${tagline}`,
        },
        description,
        // Pages that don't override alternates (e.g. a 404) at least get the
        // home page's hreflang map. Better than nothing for crawlers.
        alternates,
        openGraph: {
            type: 'website',
            siteName: SITE_NAME,
            title: `${SITE_NAME} — ${tagline}`,
            description,
            url: typeof alternates.canonical === 'string' ? alternates.canonical : undefined,
            locale,
            alternateLocale: routing.locales.filter((l) => l !== locale),
        },
        twitter: {
            card: 'summary_large_image',
            title: `${SITE_NAME} — ${tagline}`,
            description,
        },
        robots: { index: true, follow: true },
    };
}

// Theme color belongs to the viewport export (Next 14+ moved it out of
// metadata). Aligned with --accent in globals.css (the green brand color
// used for the submit button and the brand mark).
export const viewport: Viewport = {
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#1f8a64' },
        { media: '(prefers-color-scheme: dark)', color: '#2da17a' },
    ],
};

const inter = Inter({
    subsets: ['latin', 'cyrillic'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-inter',
    display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin', 'cyrillic'],
    weight: ['400', '500', '600'],
    variable: '--font-jetbrains',
    display: 'swap',
});

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    setRequestLocale(locale);
    const messages = await getMessages();
    const nonce = (await headers()).get('x-nonce') ?? undefined;

    return (
        <html
            lang={locale}
            dir={localeDirection(locale)}
            suppressHydrationWarning
            className={`${inter.variable} ${jetbrainsMono.variable}`}
        >
            <head>
                {/* Apply the user's saved theme before first paint to avoid a flash
                    when the explicit choice differs from the system preference.
                    `data-theme-choice` mirrors the choice (incl. "system") so the
                    theme switch can highlight the right button via pure CSS. */}
                <script
                    nonce={nonce}
                    suppressHydrationWarning
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline pre-hydration script.
                    dangerouslySetInnerHTML={{
                        __html: "(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'&&t!=='system')t='system';if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-theme-choice',t);}catch(e){}})();",
                    }}
                />
            </head>
            <body>
                <ClientLocaleProvider initialLocale={locale as Locale} initialMessages={messages}>
                    <ThemeProvider nonce={nonce}>
                        <NavShell header={<SiteHeader />} footer={<SiteFooter />}>
                            {children}
                        </NavShell>
                    </ThemeProvider>
                </ClientLocaleProvider>
            </body>
        </html>
    );
}
