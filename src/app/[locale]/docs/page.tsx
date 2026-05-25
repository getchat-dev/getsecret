import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { loadContent } from '@/lib/content';
import { buildPageMetadata } from '@/lib/site-meta';

const NAV_KEY = 'docs';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('docs', locale);
    return buildPageMetadata({
        locale,
        path: '/docs',
        title: frontmatter.title,
        description: frontmatter.metaDescription,
        type: 'article',
    });
}

export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const navT = await getTranslations('nav');
    const { default: Content, frontmatter } = await loadContent('docs', locale);

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
