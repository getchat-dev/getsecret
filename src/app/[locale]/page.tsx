import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateForm } from '@/components/secret/create-form';
import { CreateIntro } from '@/components/secret/create-intro';
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

    return (
        <main className="page">
            <CreateIntro />
            <CreateForm enableMultiRead={isMultiReadEnabled()} enablePassword={isPasswordEnabled()} />
        </main>
    );
}
