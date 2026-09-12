import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { loadContent } from '@/lib/content';
import { buildPageMetadata, socialCardAlt } from '@/lib/site-meta';

const NAV_KEY = 'api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('developers', locale);
    const tMeta = await getTranslations({ locale, namespace: 'meta' });
    return buildPageMetadata({
        locale,
        path: '/developers',
        title: frontmatter.title,
        description: frontmatter.metaDescription,
        type: 'article',
        imageAlt: socialCardAlt(tMeta('tagline')),
        // Placeholder body: unlisted until the MDX is written.
        noindex: true,
    });
}

export default async function DevelopersPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const navT = await getTranslations('nav');
    const { default: Content, frontmatter } = await loadContent('developers', locale);

    return (
        <main className="page">
            <span className="eyebrow">{navT(NAV_KEY)}</span>
            <h1 className="display">{frontmatter.title}</h1>
            <p className="lede">{frontmatter.lede}</p>
            <article className="page-prose">
                <Content />
            </article>
        </main>
    );
}
