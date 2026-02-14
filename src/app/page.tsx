import { SecretForm } from '@/components/secret-form';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="page">
      <header className="hero">
        <h1>Burnotes</h1>
        <p>Send a secret in a link that self-destructs after first read.</p>
      </header>
      <SecretForm />
    </main>
  );
}
