// Filenames here are sender-controlled: they travel inside the encrypted
// envelope / file container and end up on the recipient's screen and in an
// `<a download>` attribute. React escapes them as text, so HTML injection is
// not the risk — spoofing and filesystem breakage are. sanitizeFilename is the
// single gate for every such name, applied on input, on encode and on decode.

// Base name the create form starts with and the viewer falls back to for
// secrets whose envelope carries no name (created before names existed).
export const DEFAULT_SECRET_FILENAME = 'secret';

// Input cap for the base name, in characters (the <input maxLength>).
export const MAX_SECRET_NAME_LENGTH = 100;

// Filesystems cap a name at 255 bytes. Stay well under it so the extension
// and any browser-added " (1)" suffix still fit after multibyte UTF-8.
export const MAX_FILENAME_BYTES = 200;

// A trailing ".ext" this short is treated as an extension worth keeping when
// a long name has to be truncated.
const MAX_EXTENSION_LENGTH = 16;

// \p{Cc}: C0/C1 controls (NUL, newline, ESC…).
// \p{Cf}: invisible format chars — bidi overrides/isolates (U+202A–202E,
//   U+2066–2069, LRM/RLM) and zero-width chars. U+202E is the classic
//   "invoice‮fdp.exe" trick that renders as "invoiceexe.pdf".
// \p{Cs}: lone surrogates — malformed UTF-16 that encodes as U+FFFD.
// \p{Zl}\p{Zp}: line/paragraph separators.
// The ASCII set is what Windows rejects plus both path separators.
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>:"/\\|?*]/gu;

// Device names Windows refuses as a file stem regardless of extension
// ("CON.txt" cannot be created).
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

const textEncoder = new TextEncoder();

function byteLength(value: string): number {
    return textEncoder.encode(value).length;
}

// UTF-8 width of one code point. Lone surrogates never reach here
// (FORBIDDEN_CHARS strips them).
function utf8Width(codePoint: number): number {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
}

// Keeps the longest prefix of whole code points whose UTF-8 encoding fits in
// maxBytes — never splits a surrogate pair. Single linear pass, so a
// megabyte-long name costs no more than reading it once.
function truncateToBytes(value: string, maxBytes: number): string {
    let bytes = 0;
    let end = 0;
    for (const char of value) {
        bytes += utf8Width(char.codePointAt(0) as number);
        if (bytes > maxBytes) break;
        end += char.length;
    }
    return value.slice(0, end);
}

function isEdgeJunk(char: string): boolean {
    return char === '.' || /\s/.test(char);
}

// Strips dots and whitespace from both ends. A loop rather than
// /[\s.]+$/: that regex backtracks quadratically on a long run of dots
// followed by any other character.
function trimEdges(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && isEdgeJunk(value[start])) start += 1;
    while (end > start && isEdgeJunk(value[end - 1])) end -= 1;
    return value.slice(start, end);
}

// Returns a name safe to display and to hand to `<a download>`, or '' when
// nothing usable is left (callers substitute their own default).
export function sanitizeFilename(value: string): string {
    let name = trimEdges(value.normalize('NFC').replace(FORBIDDEN_CHARS, '').replace(/\s+/g, ' '));
    if (name.length === 0) return '';

    const stem = name.split('.')[0];
    if (WINDOWS_RESERVED.test(stem)) name = `_${name}`;

    if (byteLength(name) > MAX_FILENAME_BYTES) {
        const dot = name.lastIndexOf('.');
        const ext = dot > 0 && name.length - dot - 1 <= MAX_EXTENSION_LENGTH ? name.slice(dot) : '';
        const base = ext ? name.slice(0, dot) : name;
        name = trimEdges(truncateToBytes(base, MAX_FILENAME_BYTES - byteLength(ext))) + ext;
    }
    return trimEdges(name);
}

// Server-side: the operator can rebrand the default via DEFAULT_SECRET_FILENAME.
// Read at request time like the feature flags, so no rebuild is needed. A value
// that sanitizes to nothing falls back to the built-in default.
export function getDefaultSecretFilename(): string {
    const fromEnv = sanitizeFilename(process.env.DEFAULT_SECRET_FILENAME ?? '');
    return fromEnv.length > 0 ? fromEnv : DEFAULT_SECRET_FILENAME;
}
