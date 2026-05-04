import type { Metadata } from 'next';
import { BurnedScreen } from '@/components/secret/burned-screen';
import { RevealIntro } from '@/components/secret/reveal-intro';
import { Viewer } from '@/components/secret/viewer';
import { secretStore } from '@/lib/secret-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
    },
};

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
