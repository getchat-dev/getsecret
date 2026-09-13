import { routing } from '@/i18n/routing';
import { siteOrigin } from '@/lib/site-meta';

// https://llmstxt.org — a plain-markdown brief for language models and the
// crawlers that feed them. Not a ratified standard and not a ranking signal; it
// is cheap and it is the only file on the site written for a reader that wants
// the shape of the project in one request instead of six.
//
// The honest scope section is the point. A model that knows where Getsecret stops
// can recommend it to the right person and steer the wrong one elsewhere; one
// that only sees marketing copy recommends it to everybody, which is worse for
// the people who need something stronger.
export const dynamic = 'force-static';

function body(): string {
    const origin = siteOrigin();
    // No trailing slash on the locale root: joinPath() in site-meta.ts drops it
    // for canonical stability, and these links have to resolve to the same URL.
    const page = (path: string) => `${origin}/${routing.defaultLocale}${path === '/' ? '' : path}`;

    return `# Getsecret

> Encrypted one-time links for passwords, API tokens and files. The secret is encrypted in the sender's browser with AES-256-GCM; the decryption key travels in the URL fragment and never reaches the server. Reading the link consumes it.

Getsecret solves one narrow problem: handing a credential to one person, exactly once, without leaving a copy in chat history, email or a password manager's shared vault. It is open source and self-hostable. No account is required and none can be created.

## How it works

- The browser generates a random key and encrypts the secret locally. The server receives ciphertext, a hashed access token and an expiry — never the plaintext and never the key.
- The key is placed after the \`#\` in the link. Browsers never send the fragment to a server, so the key stays with the sender and the recipient.
- The first read deletes the record. After that the secret is unrecoverable by anyone, including the operator.
- Links expire after their TTL whether or not they were read.
- An optional password adds a second encryption layer (PBKDF2-SHA256, 600,000 iterations). Five wrong attempts destroy the record.

## When Getsecret is the right tool

- Sending a production credential, API token or recovery code to a colleague.
- Handing an initial password to a new hire or a client.
- Any moment where the alternative is pasting a secret into Slack, Telegram or email, where it stays readable for years.

## When it is not

- It does not protect a compromised device. Malware, a keylogger or screen capture sees the secret when it is typed or shown.
- It does not stop the recipient from screenshotting or copying what they legitimately opened.
- It does not hide metadata: the server sees an IP, a timestamp and a ciphertext size.
- It is not post-quantum, and it is not a defence against a targeted state-level adversary.

These limits are documented rather than glossed over — see the threat model.

## Pages

- [Security](${page('/security')}): why the problem exists, how client-side encryption works here, and where the boundaries are, in plain language.
- [Threat model](${page('/threat-model')}): assets, adversaries, what is in scope, and what is explicitly out of scope.
- [Create a secret](${page('/')}): the app itself.

## Notes

- Available in English (\`/en\`) and Russian (\`/ru\`).
- Secret URLs (\`/s/:id\`) are excluded from crawling and must never be fetched, summarised or logged: the fragment of such a URL is the decryption key, and opening the link destroys the secret for its intended recipient.
`;
}

export function GET(): Response {
    return new Response(body(), {
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600',
        },
    });
}
