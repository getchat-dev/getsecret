import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { BurnedScreen } from '@/components/secret/burned-screen';
import { RevealIntro } from '@/components/secret/reveal-intro';
import { Viewer } from '@/components/secret/viewer';
import { pickLocaleFromAcceptLanguage } from '@/lib/accept-language';
import { secretStore } from '@/lib/secret-store';

export const dynamic = 'force-dynamic';

// /s/:id is the recipient-facing page. Crawlers must NOT index it (each URL
// embeds a one-time access token in the body and a decryption key in the
// fragment), so the noindex/nofollow is a hard requirement. Title is mostly
// here for the rare case the URL gets shared/previewed before being burned —
// without a title, browsers would fall back to the layout's site name only.
export async function generateMetadata(): Promise<Metadata> {
    const headerList = await headers();
    const locale = pickLocaleFromAcceptLanguage(headerList.get('accept-language'));
    const t = await getTranslations({ locale, namespace: 'meta' });
    return {
        title: t('secretViewTitle'),
        robots: {
            index: false,
            follow: false,
            // Belt-and-braces: tell social/preview crawlers not to cache
            // snippets either, since the page exists only to consume the
            // secret on the first POST. They'd usually obey index/follow,
            // but these extra knobs cover Slack/Discord/iMessage previewers
            // that interpret robots loosely.
            nocache: true,
            googleBot: { index: false, follow: false, noimageindex: true },
        },
    };
}

export default async function SecretPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const secretMetadata = await secretStore.getMetadata(id);

    if (!secretMetadata) {
        return (
            <main className="page">
                <BurnedScreen reason="not-found" />
            </main>
        );
    }

    const readsRemaining: number | null =
        secretMetadata.maxViews === null ? null : Math.max(0, secretMetadata.maxViews - secretMetadata.viewsUsed);

    return (
        <main className="page">
            <RevealIntro readsRemaining={readsRemaining} />
            <Viewer
                id={id}
                expiresAtUtc={new Date(secretMetadata.expiresAt).toISOString()}
                maxViews={secretMetadata.maxViews}
                viewsUsed={secretMetadata.viewsUsed}
                passwordParams={secretMetadata.passwordParams}
            />
        </main>
    );
}
