import { SecretViewer } from '@/components/secret-viewer';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function SecretPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="page">
      <header className="hero">
        <h1>Burnotes</h1>
        <p>This page is for one-time secret reading.</p>
      </header>
      <SecretViewer id={id} />
    </main>
  );
}
