// Emits a schema.org payload as a JSON-LD data block.
//
// No nonce, deliberately. A <script> whose type is not a JavaScript MIME type is
// a data block: the HTML spec's "prepare the script element" steps bail out
// before the Content Security Policy inline check, so `script-src` never applies
// and the strict policy in security-headers.ts does not block this. Carrying one
// anyway broke hydration — browsers blank the nonce content attribute after
// parsing (so it cannot be read back out through a CSS attribute selector), and
// React then compared the server's value against an empty string on the client.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
    // The payload is built from our own constants and localized strings, never
    // from user input; the escape below still closes the one way a '<' in a
    // translated string could terminate the element early.
    const json = JSON.stringify(data).replace(/</g, '\\u003c');

    return (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a JSON-LD block has to reach the DOM verbatim — React would escape the quotes if this were a child.
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
    );
}
