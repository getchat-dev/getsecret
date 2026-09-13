// Generates src/lib/faq-schema.generated.ts from the FAQ MDX sources.
//
// Why codegen instead of reading the MDX at runtime: `output: 'standalone'`
// copies only what file tracing can see, and tracing is static — an
// `fs.readFile` with a composed path is invisible to it, so `src/content`
// would not ship. A generated module is a normal import, so it is traced like
// any other file, costs nothing per request, and survives a change of deploy
// target. The alternative was an `outputFileTracingIncludes` entry plus a
// read on every request; this has neither.
//
// Run by `npm run gen:faq`, and automatically before `build` and `dev`.
// The output is committed: `npm test` and `npm run check` must work without a
// generate step. faq-schema.generated.test.ts fails if it drifts from the MDX.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const faqDir = join(repoRoot, 'src/content/faq');
const outFile = join(repoRoot, 'src/lib/faq-schema.generated.ts');

// Strips the inline markdown schema.org has no use for. `Answer.text` accepts a
// limited subset of HTML, but a search engine and a language model both do
// better with the sentence than with its markup, and plain text cannot break
// the surrounding JSON.
function toPlainText(markdown) {
    return markdown
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [текст](/ссылка) -> текст
        .replace(/`([^`]+)`/g, '$1') // `код` -> код
        .replace(/\*\*([^*]+)\*\*/g, '$1') // **жирный** -> жирный
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1') // *курсив* -> курсив
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Splits one FAQ MDX file into question/answer pairs.
 * Exported so the drift test can re-derive them instead of restating the rules.
 */
export function parseFaq(source) {
    // Frontmatter is delimited by the first two '---' lines; everything after
    // the second one is the body.
    const body = source.split(/^---$/m).slice(2).join('---');
    const sections = body.split(/^## /m).slice(1);

    return sections.map((section) => {
        const newline = section.indexOf('\n');
        const question = section.slice(0, newline === -1 ? undefined : newline).trim();
        const answer = toPlainText(newline === -1 ? '' : section.slice(newline));
        if (!question) throw new Error('FAQ section with an empty heading');
        if (!answer) throw new Error(`FAQ question with no answer: ${question}`);
        return { question, answer };
    });
}

export function collectFaq() {
    const locales = readdirSync(faqDir)
        .filter((name) => name.endsWith('.mdx'))
        .map((name) => name.replace(/\.mdx$/, ''))
        .sort();

    return Object.fromEntries(
        locales.map((locale) => [locale, parseFaq(readFileSync(join(faqDir, `${locale}.mdx`), 'utf8'))]),
    );
}

function render(byLocale) {
    // Biome would reformat a single-quoted string containing an apostrophe into
    // a double-quoted one, and `prebuild` runs on every build — emitting anything
    // else means each build leaves the working tree dirty.
    const quote = (value) => {
        const escaped = value.replace(/\\/g, '\\\\');
        return escaped.includes("'") && !escaped.includes('"') ? `"${escaped}"` : `'${escaped.replace(/'/g, "\\'")}'`;
    };
    const blocks = Object.entries(byLocale).map(([locale, entries]) => {
        const items = entries
            .map(
                (e) =>
                    `        {\n            question: ${quote(e.question)},\n            answer: ${quote(e.answer)},\n        },`,
            )
            .join('\n');
        return `    ${locale}: [\n${items}\n    ],`;
    });

    return `// GENERATED FILE — do not edit. Run \`npm run gen:faq\` after changing
// src/content/faq/*.mdx. faq-schema.generated.test.ts fails when this drifts.

export type FaqEntry = { question: string; answer: string };

export const FAQ_ENTRIES: Record<string, readonly FaqEntry[]> = {
${blocks.join('\n')}
};
`;
}

// Only when run as a command. The drift test imports parseFaq/collectFaq from
// this file, and importing must never write to the working tree.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const byLocale = collectFaq();
    const total = Object.values(byLocale).reduce((sum, list) => sum + list.length, 0);
    writeFileSync(outFile, render(byLocale), 'utf8');
    console.log(`faq-schema: ${total} Q&A across ${Object.keys(byLocale).length} locales -> ${outFile}`);
}
