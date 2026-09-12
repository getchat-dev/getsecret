import { headers } from 'next/headers';

// Emits a schema.org payload as a JSON-LD data block.
//
// The nonce is not decoration. `buildCspHeader` ships `script-src 'self'
// 'nonce-…' 'strict-dynamic'` with no 'unsafe-inline', and while a data block
// is not executable script, browsers have not always agreed on whether the
// inline check applies to it. Carrying the nonce makes the question moot.
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
    const nonce = (await headers()).get('x-nonce') ?? undefined;
    // The payload is built from our own constants and localized strings, never
    // from user input; the escape below still closes the one way a '<' in a
    // translated string could terminate the element early.
    const json = JSON.stringify(data).replace(/</g, '\\u003c');

    return (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a JSON-LD block has to reach the DOM verbatim — React would escape the quotes if this were a child.
        <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />
    );
}
