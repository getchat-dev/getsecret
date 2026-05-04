import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { loadContent } from '@/lib/content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const { frontmatter } = await loadContent('faq', locale);
    const title = `${frontmatter.title} · Burnotes`;
    return {
        title,
        description: frontmatter.metaDescription,
        openGraph: { title, description: frontmatter.metaDescription },
    };
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
