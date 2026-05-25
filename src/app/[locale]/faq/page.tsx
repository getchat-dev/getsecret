import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { loadContent } from '@/lib/content';
import { buildPageMetadata } from '@/lib/site-meta';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('faq', locale);
    return buildPageMetadata({
        locale,
        path: '/faq',
        title: frontmatter.title,
        description: frontmatter.metaDescription,
        type: 'article',
    });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const { default: Content, frontmatter } = await loadContent('faq', locale);

    return (
        <main className="page">
            <span className="eyebrow">FAQ</span>
            <h1 className="display">{frontmatter.title}</h1>
            <p className="lede">{frontmatter.lede}</p>
            <article className="page-prose">
                <Content />
            </article>
        </main>
    );
}
