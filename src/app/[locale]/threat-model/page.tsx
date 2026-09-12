import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/json-ld';
import { loadContent } from '@/lib/content';
import { buildPageMetadata, socialCardAlt } from '@/lib/site-meta';
import { techArticleLd } from '@/lib/structured-data';

const NAV_KEY = 'threatModel';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('threat-model', locale);
    const tMeta = await getTranslations({ locale, namespace: 'meta' });
    // No "· Burnotes" suffix here — the root layout sets title.template
    // which composes "%s · Burnotes" automatically.
    return buildPageMetadata({
        locale,
        path: '/threat-model',
        title: frontmatter.title,
        description: frontmatter.metaDescription,
        type: 'article',
        imageAlt: socialCardAlt(tMeta('tagline')),
    });
}

export default async function ThreatModelPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const navT = await getTranslations('nav');
    const { default: Content, frontmatter } = await loadContent('threat-model', locale);

    return (
        <main className="page">
            <JsonLd
                data={techArticleLd({
                    locale,
                    path: '/threat-model',
                    title: frontmatter.title,
                    description: frontmatter.metaDescription,
                })}
            />
            <span className="eyebrow">{navT(NAV_KEY)}</span>
            <h1 className="display">{frontmatter.title}</h1>
            <p className="lede">{frontmatter.lede}</p>
            <article className="page-prose">
                <Content />
            </article>
        </main>
    );
}
