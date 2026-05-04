import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClientLocaleProvider } from '@/components/layout/client-locale-provider';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/theme-provider';
import { type Locale, routing } from '@/i18n/routing';
import '../globals.css';

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
        <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
                        <div className="bg-grid" aria-hidden="true" />
                        <SiteHeader />
                        {children}
                        <SiteFooter />
                    </ThemeProvider>
                </ClientLocaleProvider>
            </body>
        </html>
    );
}
