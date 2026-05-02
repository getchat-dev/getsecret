import { Inter, JetBrains_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/theme-provider';
import { routing } from '@/i18n/routing';
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

    return (
        <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
            <body>
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <ThemeProvider>
                        <div className="bg-grid" aria-hidden="true" />
                        <SiteHeader />
                        {children}
                        <SiteFooter />
                    </ThemeProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
