# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` contains a deeper orientation (file map, end-to-end flows, invariants). Read it before non-trivial work.

## Commands

- `npm run dev` — Next dev server on `http://localhost:3000`
- `npm run build` / `npm start` — production build / run (`output: 'standalone'`)
- `npm run check` — Biome format + lint + import-organization check (CI gate)
- `npm run fix` — Biome auto-fix
- `npm test` — Vitest suite (runs once)
- `npm run test:watch` — Vitest in watch mode
- Run a single test file: `npx vitest run src/lib/secret-crypto.test.ts`
- Run a single test by name: `npx vitest run -t "partial test name"`
- `npm run hooks:install` — point git at `.githooks/` (pre-commit runs `npm run check` then `npm test`)
- Dev in Docker: `docker compose -f docker-compose.dev.yml up` or `./start.sh --dev` (uses `werf compose`)
- Valkey infra (once per host): `docker compose -f docker-compose.infra.yml up -d` — outlives `./start.sh --down/--purge`

## Architecture

Burnotes is a **client-side-encryption** one-time secret relay built on Next.js 16 App Router (React 19, strict TS, no database). The server is intentionally ignorant of plaintext.

**Trust boundary.** The browser generates a random key, encrypts the secret with AES-GCM, and derives two values from the key: an `id` (used in the URL path) and an `accessToken` (sent in the body). The server stores `{ encryptedSecret, accessTokenHash, expiresAt }` only. The key itself lives in the URL fragment (`/s/:id#<key>`) and never reaches the server. All crypto and derivations live in `src/lib/secret-crypto.ts` — treat it as security-critical.

**Storage.** `src/lib/secret-store.ts` and `src/lib/rate-limit.ts` are Valkey-backed through `src/lib/valkey-client.ts` (lazy `ioredis` singleton pinned to `globalThis`). Secrets are stored as Redis Hashes with `PEXPIRE 24h`; consume is an atomic Lua script that constant-time compares the access-token hash, deletes on success, and locks out after 5 wrong attempts. Rate limiting uses a sorted-set sliding window. Valkey runs in its own Compose stack (`docker-compose.infra.yml`) so application restarts (and `./start.sh --down/--purge`) do not erase state. `VALKEY_URL` is required.

**Request path.**
- `POST /api/secrets` (`src/app/api/secrets/route.ts`) — validate, rate-limit (await), hash token, store (await).
- `POST /api/secrets/[id]` (`src/app/api/secrets/[id]/route.ts`) — hash token, atomically consume record via Lua (await), return ciphertext once.
- API routes pin `runtime = 'nodejs'` (crypto + `ioredis` socket). Responses are `no-store`.

**Client flow state.** `src/components/secret-viewer.tsx` is the most stateful component: separate state machines for link validation, reveal, and reshare; `requestedRef` guards against duplicate reveal POSTs (a second POST would 404 because consume is destructive).

**Security headers** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) are set in `next.config.ts`.

## Invariants — do not break without explicit user request

- The decryption key stays in the URL fragment. Never put it in path, query, body, logs, or analytics.
- The server never sees plaintext and never needs to.
- Consume is destructive and one-time; TTL is 24h regardless of read (enforced by Valkey `PEXPIRE`).
- Access-token comparison is constant-time (inside the `consume` Lua script); brute-force lockout deletes the record after 5 misses.
- State lives in Valkey; `VALKEY_URL` is mandatory. Do not reintroduce an in-memory fallback — it masks outages and breaks durability.
- API routes stay on the Node runtime (Web Crypto + `ioredis` socket).
- `MAX_SECRET_LENGTH = 10_000`; IDs/tokens/IVs/ciphertext are base64url with explicit validators in `secret-crypto.ts`.

## Conventions

- Biome (not ESLint/Prettier) is the source of truth: 4-space indent, single quotes, semicolons, trailing commas, 120 col. `npm run check` must pass — pre-commit enforces it.
- Path alias `@/*` → `src/*`.
- Tests are colocated (`*.test.ts` next to the module) and run in the Node environment.
- When touching `secret-crypto.ts`, verify the full create → open → reveal path. When touching `secret-store.ts`, `rate-limit.ts`, `valkey-client.ts`, or routes, verify TTL, consume-once, and brute-force lockout. When touching `secret-viewer.tsx`, check missing-fragment and mismatched-key cases. Tests use `ioredis-mock` via `vitest.setup.ts`.
