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
- `npm run setup:bindings` — non-destructive recovery for npm's optionalDependencies bug (npm/cli#4828). If `npm run check` / `npm test` fails with `Cannot find module '@biomejs/cli-darwin-arm64/biome'` or `'@rolldown/binding-darwin-*'`/`'-linux-*'`, run this once. **Do not** delete `package-lock.json` and reinstall — the lockfile is fine; only platform-specific binaries failed to install. Works on host *and* inside Docker dev/build containers.
- Dev in Docker: `docker compose -f docker-compose.dev.yml up` or `./start.sh --dev` (uses `werf compose`)
- Valkey infra (once per host): `docker compose -f docker-compose.infra.yml up -d` — outlives `./start.sh --down/--purge`

## Architecture

Burnotes is a **client-side-encryption** one-time secret relay built on Next.js 16 App Router (React 19, strict TS, no database). The server is intentionally ignorant of plaintext.

**Trust boundary.** The browser generates a random key, encrypts the secret with AES-GCM, and derives two values from the key: an `id` (used in the URL path) and an `accessToken` (sent in the body). The server stores `{ encryptedSecret, accessTokenHash, expiresAt }` only. The key itself lives in the URL fragment (`/s/:id#<key>`) and never reaches the server. All crypto and derivations live in `src/lib/secret-crypto.ts` — treat it as security-critical.

**Storage.** `src/lib/secret-store.ts` and `src/lib/rate-limit.ts` are Valkey-backed through `src/lib/valkey-client.ts` (lazy `ioredis` singleton pinned to `globalThis`). Secrets are stored as Redis Hashes with `PEXPIRE 24h`; the open Lua script constant-time compares the access-token hash, locks out after 5 wrong attempts, increments `viewsUsed`, and deletes the record once `viewsUsed >= maxViews` (or stays alive when `maxViews = '-1'` for unlimited; missing field falls back to `1` for v1 backward-compat). Rate limiting uses a sorted-set sliding window. Valkey runs in its own Compose stack (`docker-compose.infra.yml`) so application restarts (and `./start.sh --down/--purge`) do not erase state. `VALKEY_URL` is required.

**Feature flags.** `MULTIREAD_ENABLED` (default `false`) gates the multi-view UI and the API: when off, the create endpoint coerces any client-supplied `maxViews` back to `1` and `<CreateForm>` hides the `<MaxViewsControl>`. `PASSWORD_PROTECTION_ENABLED` (default `false`) gates the password-protection layer: when off, `<CreateForm>` hides `<PasswordField>` and the API rejects any create request that includes `passwordParams`/`passwordVerifierHash` (400). Both are the rolling-deploy guardrails — keep the flags off across the cluster until every instance is on the new code path, then flip to `true` (env-var only, no rebuild needed for server-side reads).

**Request path.**
- `POST /api/secrets` (`src/app/api/secrets/route.ts`) — validate, rate-limit (await), hash token, store (await).
- `POST /api/secrets/[id]` (`src/app/api/secrets/[id]/route.ts`) — hash token, atomically consume record via Lua (await), return ciphertext once.
- API routes pin `runtime = 'nodejs'` (crypto + `ioredis` socket). Responses are `no-store`.

**Client flow state.** `src/components/secret-viewer.tsx` is the most stateful component: separate state machines for link validation, reveal, and reshare; `requestedRef` guards against duplicate reveal POSTs (a second POST would 404 because consume is destructive).

**Security headers** (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) are set in `next.config.ts`.

## Invariants — do not break without explicit user request

- The decryption key stays in the URL fragment. Never put it in path, query, body, logs, or analytics.
- The server never sees plaintext and never needs to.
- TTL is enforced by Valkey `PEXPIRE`, regardless of read. Consume is destructive once `viewsUsed` reaches `maxViews`; for `maxViews=1` (default and the only path under `MULTIREAD_ENABLED=false`) that's the first read.
- Access-token comparison is constant-time (inside the `OPEN_SCRIPT` Lua script); brute-force lockout deletes the record after 5 misses (this is independent of `maxViews` — wrong tokens never decrement `viewsUsed`).
- State lives in Valkey; `VALKEY_URL` is mandatory. Do not reintroduce an in-memory fallback — it masks outages and breaks durability.
- API routes stay on the Node runtime (Web Crypto + `ioredis` socket).
- `MAX_SECRET_LENGTH = 10_000`; IDs/tokens/IVs/ciphertext are base64url with explicit validators in `secret-crypto.ts`.
- `maxViews` storage encoding: positive integer = limit; `'-1'` = unlimited; field absent = v1 backward-compat → treat as `1`. The TS layer maps `null ↔ '-1'` at the boundary (`encodeMaxViews` / `decodeStoredMaxViews`).
- Password protection (stage 4) uses double encryption: PBKDF2-SHA256 (600k iterations) derives `K_inner` from the user password + per-secret salt; the secret is `AES-GCM(plaintext, K_inner, iv_inner)`, then the bundle `iv_inner || inner_ciphertext` is wrapped under `K_outer` (URL fragment). Server stores `passwordSalt`, `passwordIterations`, `passwordVerifierHash` (= `SHA256(SHA256(K_inner ‖ "burnotes:verifier:v1"))`). The verifier ↔ verifierHash chain mirrors the access-token pattern. Server never sees plaintext, password, or `K_inner`. Wrong-password attempts share the 5-strike lockout with wrong-token attempts (constant-time compare in OPEN_SCRIPT, no timing distinction).

## Conventions

- Biome (not ESLint/Prettier) is the source of truth: 4-space indent, single quotes, semicolons, trailing commas, 120 col. `npm run check` must pass — pre-commit enforces it.
- Path alias `@/*` → `src/*`.
- Tests are colocated (`*.test.ts` next to the module) and run in the Node environment.
- When touching `secret-crypto.ts`, verify the full create → open → reveal path. When touching `secret-store.ts`, `rate-limit.ts`, `valkey-client.ts`, or routes, verify TTL, consume-once, and brute-force lockout. When touching `secret-viewer.tsx`, check missing-fragment and mismatched-key cases. Tests use `ioredis-mock` via `vitest.setup.ts`.
