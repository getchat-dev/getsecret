import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
    const title = 'FAQ · Burnotes';
    const description =
        'Common questions about how Burnotes works, why secrets self-destruct, and what happens if a link is intercepted.';
    return {
        title,
        description,
        openGraph: { title, description },
    };
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <main className="page">
            <span className="eyebrow">FAQ</span>
            <h1 className="display">Frequently asked questions</h1>
            <p className="lede">
                Burnotes answers a narrow problem: how do you hand a credential to one person, exactly once, with no
                trail. The how, the trade-offs, and the things we deliberately do not do are documented here.
            </p>
            <p className="hint">
                Q&amp;A entries land here as we collect them — open an issue on GitHub if your question is not covered.
            </p>
        </main>
    );
}
