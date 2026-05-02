import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const TITLE_KEY = 'api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'nav' });
    const title = `${t(TITLE_KEY)} · Burnotes`;
    const description =
        'HTTP API reference for creating and consuming one-time secrets, including the client-side encryption envelope.';
    return {
        title,
        description,
        openGraph: { title, description },
    };
}

export default async function DevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('nav');

    return (
        <main className="page">
            <span className="eyebrow">{t(TITLE_KEY)}</span>
            <h1 className="display">{t(TITLE_KEY)}</h1>
            <p className="lede">
                Two endpoints power the whole flow: <code>POST /api/secrets</code> stores an encrypted payload with a
                hashed access token, and <code>POST /api/secrets/&#123;id&#125;</code> consumes that record exactly once
                in an atomic Lua transaction. All crypto happens in the browser; the server only sees ciphertext.
            </p>
            <p className="hint">Reference shapes, error codes, and rate-limit details land here next.</p>
        </main>
    );
}
