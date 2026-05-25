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
    const tMeta = await getTranslations({ locale, namespace: 'meta' });
    return buildPageMetadata({
        locale,
        path: '/',
        title: `${t('title1')} ${t('title2')}`.trim(),
        // Dedicated SEO-tuned description (~150 chars). create.lede is the
        // on-page intro paragraph (~270 chars) and gets cut mid-sentence by
        // SERP truncation — using it here would waste the description slot.
        description: tMeta('homeDescription'),
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
