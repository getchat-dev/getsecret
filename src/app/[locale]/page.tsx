import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateForm } from '@/components/secret/create-form';
import { CreateIntro } from '@/components/secret/create-intro';
import { JsonLd } from '@/components/seo/json-ld';
import { isMultiReadEnabled, isPasswordEnabled } from '@/lib/feature-flags';
import { buildPageMetadata, SITE_NAME, socialCardAlt } from '@/lib/site-meta';
import { homePageLd } from '@/lib/structured-data';

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
        imageAlt: socialCardAlt(tMeta('tagline')),
    });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const tMeta = await getTranslations({ locale, namespace: 'meta' });

    return (
        <main className="page">
            <JsonLd
                data={homePageLd({
                    locale,
                    name: `${SITE_NAME} — ${tMeta('tagline')}`,
                    description: tMeta('description'),
                })}
            />
            <CreateIntro />
            <CreateForm enableMultiRead={isMultiReadEnabled()} enablePassword={isPasswordEnabled()} />
        </main>
    );
}
