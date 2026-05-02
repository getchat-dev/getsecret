import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const TITLE_KEY = 'docs';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'nav' });
    const title = `${t(TITLE_KEY)} · Burnotes`;
    const description =
        'How Burnotes encrypts secrets in your browser, the URL fragment trust boundary, and the API contract for self-hosting.';
    return {
        title,
        description,
        openGraph: { title, description },
    };
}

export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('nav');

    return (
        <main className="page">
            <span className="eyebrow">{t(TITLE_KEY)}</span>
            <h1 className="display">{t(TITLE_KEY)}</h1>
            <p className="lede">
                Burnotes is a one-time secret relay that ships ciphertext to a 24-hour Valkey hash and hands the
                decryption key back through the URL fragment. The full protocol — how the AES-GCM key is generated, why
                the access token is hashed twice, how brute-force attempts are bounded — is documented alongside the
                source.
            </p>
            <p className="hint">Detailed guides are landing here next; in the meantime, see the README on GitHub.</p>
        </main>
    );
}
