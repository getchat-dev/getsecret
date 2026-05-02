import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SecretForm } from '@/components/secret-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'create' });
    const title = `${t('title1')} ${t('title2')}`.trim();
    return {
        title,
        description: t('lede'),
        openGraph: {
            title,
            description: t('lede'),
            type: 'website',
        },
    };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('create');

    return (
        <main className="page">
            <header className="hero">
                <h1>
                    {t('title1')} {t('title2')}
                </h1>
                <p>{t('lede')}</p>
            </header>
            <SecretForm />
        </main>
    );
}
