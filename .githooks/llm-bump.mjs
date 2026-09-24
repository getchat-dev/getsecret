// Спрашивает у Ollama, какой semver-бамп нужен для staged-diff'а.
// stdout: одна цифра — 1 (major), 2 (minor) или 3 (patch).
// Ненулевой exit + сообщение в stderr — если Ollama недоступна / диф пуст.
//
// Конфиг через env:
//   OLLAMA_URL    — дефолт http://192.168.1.61:11434
//   OLLAMA_MODEL  — если не задан, просим выбрать из /api/tags через /dev/tty;
//                   в CI или без терминала — падаем, а не угадываем модель
//   OLLAMA_TIMEOUT_MS — дефолт 30000

import { execSync } from 'node:child_process';
import { openSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import tty from 'node:tty';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://192.168.1.61:11434';
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

function isCI() {
    const ci = process.env.CI;
    return Boolean(ci) && ci !== 'false' && ci !== '0';
}

// Хук забирает stdout как ответ, а stderr пишет в файл, поэтому диалог идёт напрямую
// через управляющий терминал. null — терминала нет (CI, IDE, detached-процесс).
function openTty() {
    if (isCI()) return null;
    try {
        return {
            input: new tty.ReadStream(openSync('/dev/tty', 'r')),
            output: new tty.WriteStream(openSync('/dev/tty', 'w')),
        };
    } catch {
        return null;
    }
}

// /api/tags отдаёт размер файла модели — при загрузке она занимает в памяти примерно столько же
// (плюс KV-кэш под контекст). Точный size_vram есть только у уже загруженных, в /api/ps.
function formatSize(bytes) {
    return `${(bytes / 1e9).toFixed(1)} GB`;
}

async function askModel(term, models) {
    const names = models.map((m) => m.name);
    const width = Math.max(...names.map((name) => name.length));
    const rl = createInterface({ input: term.input, output: term.output });
    try {
        term.output.write('\nOLLAMA_MODEL не задан. Какую модель использовать?\n');
        for (const [i, m] of models.entries()) {
            term.output.write(`  [${i + 1}] ${m.name.padEnd(width)}  ${formatSize(m.size).padStart(8)}\n`);
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            const answer = (await rl.question(`Выбор [1-${names.length}]: `)).trim();
            const picked = names[Number(answer) - 1] ?? names.find((name) => name === answer);
            if (picked) {
                term.output.write(`Чтобы не спрашивать каждый раз: export OLLAMA_MODEL=${picked}\n\n`);
                return picked;
            }
            term.output.write('Неверный ввод.\n');
        }
        return null;
    } finally {
        rl.close();
        term.input.destroy();
        term.output.destroy();
    }
}

async function pickModel() {
    process.stderr.write(`[llm-bump] OLLAMA_URL=${OLLAMA_URL} OLLAMA_MODEL=${REQUESTED_MODEL ?? '(не задан)'}\n`);
    if (REQUESTED_MODEL) return REQUESTED_MODEL;
    const res = await ollamaFetch('/api/tags');
    if (!res.ok) die(`/api/tags вернул ${res.status}`);
    const { models = [] } = await res.json();
    if (models.length === 0) die('на Ollama-инстансе нет ни одной модели');

    const term = openTty();
    if (!term) {
        const available = models.map((m) => `${m.name} (${formatSize(m.size)})`).join(', ');
        die(`OLLAMA_MODEL не задан, а спросить некого (CI или нет TTY). Доступные: ${available}`);
    }
    const picked = await askModel(term, models);
    if (!picked) die('три неверных ввода — модель не выбрана');
    return picked;
}

// `node llm-bump.mjs --list` — вывести модели, доступные на Ollama-инстансе, и выйти.
async function listModels() {
    const res = await ollamaFetch('/api/tags');
    if (!res.ok) die(`/api/tags вернул ${res.status}`);
    const { models = [] } = await res.json();
    if (models.length === 0) die('на Ollama-инстансе нет ни одной модели');
    for (const m of models) {
        const params = m.details?.parameter_size || '?';
        const quant = m.details?.quantization_level || '?';
        process.stdout.write(`${m.name}\t${params}\t${quant}\t${formatSize(m.size)}\n`);
    }
}

if (process.argv[2] === '--list') {
    await listModels();
    process.exit(0);
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
