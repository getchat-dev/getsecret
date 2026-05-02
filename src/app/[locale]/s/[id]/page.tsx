import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BurnedScreen } from '@/components/secret/burned-screen';
import { Viewer } from '@/components/secret/viewer';
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
    const tEyebrow = await getTranslations('eyebrow');

    const secretMetadata = await secretStore.getMetadata(id);

    if (!secretMetadata) {
        return (
            <main className="page">
                <BurnedScreen reason="not-found" />
            </main>
        );
    }

    return (
        <main className="page">
            <span className="eyebrow">
                <span className="ember-dot" />
                {tEyebrow('reveal')}
            </span>
            <h1 className="display">{t('title')}</h1>
            <p className="lede">{t('lede')}</p>
            <Viewer id={id} expiresAtUtc={new Date(secretMetadata.expiresAt).toISOString()} />
        </main>
    );
}
