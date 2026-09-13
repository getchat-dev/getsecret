// Types for the FAQ generator. The script stays plain .mjs so `gen:faq` runs
// with no build step; this file is what lets the drift test import it under
// `allowJs: false` without the build's type check tripping over an untyped module.

export type FaqEntry = { question: string; answer: string };

/** Splits one FAQ MDX file into question/answer pairs. */
export declare function parseFaq(source: string): FaqEntry[];

/** Derives the whole locale → entries map straight from src/content/faq/*.mdx. */
export declare function collectFaq(): Record<string, FaqEntry[]>;
