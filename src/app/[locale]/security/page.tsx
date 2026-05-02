import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const TITLE_KEY = 'security';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'nav' });
    const title = `${t(TITLE_KEY)} · Burnotes`;
    const description = 'Threat model, cryptographic invariants, and the privacy posture behind Burnotes.';
    return {
        title,
        description,
        openGraph: { title, description },
    };
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('nav');

    return (
        <main className="page">
            <span className="eyebrow">{t(TITLE_KEY)}</span>
            <h1 className="display">{t(TITLE_KEY)}</h1>
            <p className="lede">
                The server never observes plaintext. Secrets are encrypted client-side with AES-256-GCM, the random key
                lives only after <code>#</code> in the URL, and a 5-attempt brute-force lockout deletes the record on
                misuse. Constant-time access-token comparison runs inside the consume Lua script.
            </p>
            <p className="hint">
                A full security write-up — threat model, deployment hardening, and CSP design — is in progress.
            </p>
        </main>
    );
}
