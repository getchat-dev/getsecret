import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateForm } from '@/components/secret/create-form';
import { isMultiReadEnabled, isPasswordEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'create' });
    const title = `${t('title1')} ${t('title2')}`.trim();
    return {
        title,
        description: t('lede'),
        openGraph: { title, description: t('lede'), type: 'website' },
    };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations('create');
    const tEyebrow = await getTranslations('eyebrow');

    return (
        <main className="page">
            <span className="eyebrow">
                <span className="ember-dot" />
                {tEyebrow('create')}
            </span>
            <h1 className="display">
                {t('title1')} <span className="accent-word">{t('title2')}</span>
            </h1>
            <p className="lede">{t('lede')}</p>
            <CreateForm enableMultiRead={isMultiReadEnabled()} enablePassword={isPasswordEnabled()} />
        </main>
    );
}
