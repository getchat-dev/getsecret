import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateForm } from '@/components/secret/create-form';
import { CreateIntro } from '@/components/secret/create-intro';
import { isMultiReadEnabled, isPasswordEnabled } from '@/lib/feature-flags';
import { buildPageMetadata } from '@/lib/site-meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'create' });
    return buildPageMetadata({
        locale,
        path: '/',
        title: `${t('title1')} ${t('title2')}`.trim(),
        description: t('lede'),
    });
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
