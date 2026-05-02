import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SecretViewer } from '@/components/secret-viewer';
import { secretStore } from '@/lib/secret-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
    },
};

export default async function SecretPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('reveal');
    const secretMetadata = await secretStore.getMetadata(id);

    return (
        <main className="page">
            <header className="hero">
                <h1>{t('title')}</h1>
                <p>{t('lede')}</p>
            </header>
            <SecretViewer
                id={id}
                expiresAtUtc={secretMetadata ? new Date(secretMetadata.expiresAt).toISOString() : null}
            />
        </main>
    );
}
