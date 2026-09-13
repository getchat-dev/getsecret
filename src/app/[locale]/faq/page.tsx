import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FaqDisclosures } from '@/components/content/faq-disclosures';
import { JsonLd } from '@/components/seo/json-ld';
import { loadContent } from '@/lib/content';
import { FAQ_ENTRIES } from '@/lib/faq-schema.generated';
import { buildPageMetadata, socialCardAlt } from '@/lib/site-meta';
import { faqPageLd } from '@/lib/structured-data';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('faq', locale);
    const tMeta = await getTranslations({ locale, namespace: 'meta' });
    return buildPageMetadata({
        locale,
        path: '/faq',
        title: frontmatter.title,
        description: frontmatter.metaDescription,
        type: 'article',
        imageAlt: socialCardAlt(tMeta('tagline')),
    });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const { default: Content, frontmatter } = await loadContent('faq', locale);

    const entries = FAQ_ENTRIES[locale] ?? [];

    return (
        <main className="page">
            {entries.length > 0 && <JsonLd data={faqPageLd({ locale, entries })} />}
            <span className="eyebrow">FAQ</span>
            <h1 className="display">{frontmatter.title}</h1>
            {frontmatter.lede && <p className="lede">{frontmatter.lede}</p>}
            <article className="page-prose">
                <FaqDisclosures>
                    <Content />
                </FaqDisclosures>
            </article>
        </main>
    );
}
