// Turns the FAQ's `## question` + following prose into a native <details>
// disclosure, at compile time.
//
// Native <details> is the whole point: collapsed is its default state, keyboard
// and screen-reader behaviour come for free, it works with JavaScript disabled,
// and the answer text still sits in the HTML where a crawler reads it. The
// alternative — authoring <FaqItem> wrappers in the MDX — would push component
// syntax into a file that editors and the ru-text pass both read as prose, and
// would break the `## ` contract scripts/faq-schema.mjs parses.
//
// Scoped by file path: every other MDX page keeps plain headings.

const FAQ_PATH = /[/\\]content[/\\]faq[/\\]/;

function isHeading(node) {
    return node.type === 'element' && node.tagName === 'h2';
}

export default function rehypeFaqDetails() {
    return (tree, file) => {
        if (!file?.path || !FAQ_PATH.test(file.path)) return;

        const out = [];
        let index = 0;

        // Anything before the first heading (an intro paragraph, say) passes
        // through untouched.
        while (index < tree.children.length && !isHeading(tree.children[index])) {
            out.push(tree.children[index]);
            index += 1;
        }

        while (index < tree.children.length) {
            const heading = tree.children[index];
            index += 1;

            const answer = [];
            while (index < tree.children.length && !isHeading(tree.children[index])) {
                answer.push(tree.children[index]);
                index += 1;
            }

            out.push({
                type: 'element',
                tagName: 'details',
                properties: { className: ['faq-item'] },
                children: [
                    {
                        type: 'element',
                        tagName: 'summary',
                        properties: { className: ['faq-summary'] },
                        children: [
                            {
                                ...heading,
                                properties: { ...heading.properties, className: ['faq-question'] },
                            },
                        ],
                    },
                    {
                        type: 'element',
                        tagName: 'div',
                        properties: { className: ['faq-answer'] },
                        children: answer,
                    },
                ],
            });
        }

        tree.children = out;
    };
}
