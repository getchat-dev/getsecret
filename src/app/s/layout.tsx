import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClientLocaleProvider } from '@/components/layout/client-locale-provider';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/theme-provider';
import { pickLocaleFromAcceptLanguage } from '@/lib/accept-language';
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

export default async function SecretRouteLayout({ children }: { children: React.ReactNode }) {
    // /s/:id has no locale segment in the URL — the language is picked from the
    // browser's Accept-Language header on every request. Page is dynamic anyway
    // (the secret data is fetched per request), so reading a header is free.
    const headerList = await headers();
    const locale = pickLocaleFromAcceptLanguage(headerList.get('accept-language'));
    setRequestLocale(locale);
    const messages = await getMessages();
    const nonce = headerList.get('x-nonce') ?? undefined;

    return (
        <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
            <head>
                {/* Apply the user's saved theme before first paint (see [locale]/layout.tsx for details). */}
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
                <ClientLocaleProvider initialLocale={locale} initialMessages={messages}>
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
