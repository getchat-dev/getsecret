// Спрашивает у Ollama, какой semver-бамп нужен для staged-diff'а.
// stdout: одна цифра — 1 (major), 2 (minor) или 3 (patch).
// Ненулевой exit + сообщение в stderr — если Ollama недоступна / диф пуст.
//
// Конфиг через env:
//   OLLAMA_URL    — дефолт http://192.168.1.121:11434
//   OLLAMA_MODEL  — если не задан, берём первую модель из /api/tags
//   OLLAMA_TIMEOUT_MS — дефолт 30000

import { execSync } from 'node:child_process';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://192.168.1.121:11434';
const REQUESTED_MODEL = process.env.OLLAMA_MODEL;
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000);
const DIFF_LIMIT = 30000; // символов, чтобы не разорвать контекст модели

function die(msg) {
    process.stderr.write(`[llm-bump] ${msg}\n`);
    process.exit(1);
}

async function ollamaFetch(path, init = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(`${OLLAMA_URL}${path}`, { ...init, signal: ctrl.signal });
    } catch (err) {
        die(`не достучался до ${OLLAMA_URL}${path}: ${err.message}`);
    } finally {
        clearTimeout(t);
    }
}

async function pickModel() {
    if (REQUESTED_MODEL) return REQUESTED_MODEL;
    const res = await ollamaFetch('/api/tags');
    if (!res.ok) die(`/api/tags вернул ${res.status}`);
    const { models = [] } = await res.json();
    if (models.length === 0) die('на Ollama-инстансе нет ни одной модели');
    return models[0].name;
}

function gatherDiff() {
    // Без аргумента — staged diff (использует pre-commit hook). С аргументом
    // (напр. HEAD) — diff конкретного коммита, для проставления версий по истории.
    const ref = process.argv[2];
    if (ref) {
        const files = execSync(`git show --name-only --format= ${ref}`, { encoding: 'utf8' }).trim();
        if (!files) die(`коммит ${ref} ничего не меняет`);
        const diff = execSync(`git show --no-color ${ref}`, { encoding: 'utf8' }).slice(0, DIFF_LIMIT);
        return { files, diff };
    }
    const files = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
    if (!files) die('нет staged-файлов');
    const diff = execSync('git diff --cached --no-color', { encoding: 'utf8' }).slice(0, DIFF_LIMIT);
    return { files, diff };
}

const PROMPT_TEMPLATE = `You are a release manager. Decide which semver part to bump based on a git diff.

Rules:
1 = major — breaking change in public API or user-visible behavior
2 = minor — new feature, backwards-compatible
3 = patch — bug fix, refactor, docs, deps, infra, no behavior change

Staged files:
{FILES}

Diff:
{DIFF}

Reply with EXACTLY one digit (1, 2, or 3). No words, no quotes, no explanation.`;

const { files, diff } = gatherDiff();
const model = await pickModel();

const res = await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model,
        prompt: PROMPT_TEMPLATE.replace('{FILES}', files).replace('{DIFF}', diff),
        stream: false,
        options: { temperature: 0 },
    }),
});
if (!res.ok) die(`/api/generate вернул ${res.status}: ${(await res.text()).slice(0, 200)}`);

const { response = '' } = await res.json();
const match = String(response).match(/[123]/);
if (!match) die(`не нашёл цифру в ответе: ${response.slice(0, 200)}`);
process.stdout.write(match[0]);
