# Burnotes Agent Guide

This file is a fast orientation guide for coding agents working in this repository.

## Project Summary

Burnotes is a small Next.js 16 App Router application for one-time secret sharing.

Core behavior:

- A sender creates a secret link in the browser.
- The secret is encrypted in the browser before upload.
- The server stores only the encrypted payload plus a hashed access token.
- The decryption key stays only in the URL fragment (`#...`) and is never sent to the server.
- A secret is deleted after the first successful read or after 24 hours.
- Storage and rate limiting use Valkey (Redis-compatible) via `ioredis`.

Valkey runs as its own Compose stack (`docker-compose.infra.yml`) and survives application restarts. See `README.md` → "Infrastructure (Valkey)" for operational details.

## Stack

- Next.js 16
- React 19
- TypeScript with strict mode
- App Router under `src/app`
- Biome for formatting, linting, and import organization
- Valkey (Redis-compatible) for server-side state via `ioredis`
- No authentication system

## Quick File Map

- `src/app/page.tsx`
  Main page for creating secrets.

- `src/app/s/[id]/page.tsx`
  Secret read page. Reads secret metadata from Valkey and passes `id` plus `expiresAtUtc` into the client viewer.

- `src/app/api/secrets/route.ts`
  Create-secret API.
  Validates input, rate limits requests, hashes the access token, and stores the encrypted payload.

- `src/app/api/secrets/[id]/route.ts`
  Consume-secret API.
  Validates secret id and access token, then consumes the secret from Valkey exactly once (atomic Lua script).

- `src/components/secret-form.tsx`
  Client form for creating a secret link.

- `src/components/secret-viewer.tsx`
  Main read/reveal UI. This is the most stateful frontend component and the main place to inspect when working on the reveal flow.

- `src/components/copy-button.tsx`
  Reusable clipboard and toast logic used across create/reveal flows.

- `src/lib/create-secret-link.ts`
  Client-side helper that encrypts the secret, posts it to the server, and returns the final absolute URL with the fragment key.

- `src/lib/secret-crypto.ts`
  Security-critical module.
  Contains ID and access-token derivation, AES-GCM encryption/decryption, payload validation, and URL fragment parsing.

- `src/lib/secret-store.ts`
  Valkey-backed store: a Redis Hash per secret plus Lua scripts for atomic create and consume (constant-time token compare, destructive one-time read, TTL 24h via `PEXPIRE`).

- `src/lib/rate-limit.ts`
  Valkey-backed IP sliding-window limiter using a sorted set per key and a pipelined `ZREMRANGEBYSCORE` / `ZADD` / `ZCARD` / `PEXPIRE`.

- `src/lib/valkey-client.ts`
  Lazy `ioredis` singleton pinned to `globalThis`. Reads `VALKEY_URL` from the environment.

- `src/lib/http.ts`
  `x-forwarded-for` / `x-real-ip` parsing and JSON no-store responses.

- `src/app/globals.css`
  All current styling lives here.

- `next.config.ts`
  Security headers and standalone output config.

## End-to-End Flow

### Create flow

1. `SecretForm` submits plain text through `createSecretLink()`.
2. `prepareSecretUpload()` in `src/lib/secret-crypto.ts`:
   - generates a random secret key
   - generates a random IV
   - encrypts the secret with AES-GCM
   - derives:
     - `id` from the key
     - `accessToken` from the key
3. The client sends `{ id, encryptedSecret, accessToken }` to `POST /api/secrets`.
4. The server hashes `accessToken` and stores:
   - `encryptedSecret`
   - `accessTokenHash`
   - `expiresAt`
5. The client builds a final link like `/s/:id#<secretKey>`.

### Read flow

1. `src/app/s/[id]/page.tsx` reads metadata from `secretStore.getMetadata(id)`.
2. `SecretViewer` reads the secret key from `window.location.hash`.
3. The browser derives:
   - the expected secret id
   - the access token
4. If the derived id does not match the URL id, the link is rejected client-side.
5. On reveal, the client posts `{ accessToken }` to `POST /api/secrets/[id]`.
6. The server hashes the token and runs an atomic Lua script against Valkey that constant-time compares the hash, deletes the record on success (or increments the failure counter, deleting after 5 misses), and returns the encrypted payload once.
7. The browser decrypts the payload locally and renders the secret.

### Reshare flow

After reveal, `SecretViewer` can create a new one-time link from the plaintext secret by calling `createSecretLink()` again.

## Security and Product Invariants

These rules are central to the project. Do not change them casually.

- The decryption key must stay in the URL fragment, not in the pathname or query string.
- The server must never need the plaintext secret to function.
- The server stores only encrypted payloads and a hash of the access token.
- Secret consumption is destructive: a successful consume removes the record from Valkey.
- Secrets expire after 24 hours even if unread (enforced by Valkey TTL).
- Server-side state lives in Valkey and survives app restarts.
- `VALKEY_URL` is required at runtime; the app will not start without it.
- API responses are intentionally `no-store`.
- Pages and routes are intentionally dynamic to avoid caching issues.
- API routes use `runtime = 'nodejs'`; do not move them to Edge without redesigning crypto/storage assumptions.

## Important Implementation Notes

- The `ioredis` client is attached to `globalThis` in `valkey-client.ts` to survive Next dev hot reloads.
- `secretStore` and `rateLimiter` hold no in-process state; all durability comes from Valkey.
- `SecretViewer` has separate state machines for:
  - link validation
  - reveal status
  - reshare status
- `requestedRef` in `SecretViewer` guards against duplicate reveal requests.
- `MAX_SECRET_LENGTH` is currently `10_000`.
- Secret IDs, access tokens, IVs, and ciphertext are base64url strings with explicit validation helpers in `secret-crypto.ts`.

## Operational Notes

- Local development:
  - `npm install`
  - `npm run hooks:install`
  - `npm run dev`

- Checks:
  - `npm run check`
  - `npm run fix`
  - `npm run build`

- Git hooks:
  - `.githooks/pre-commit` runs `npm run check`

- Container/dev infra:
  - `docker compose -f docker-compose.infra.yml up -d` (Valkey; run once per host)
  - `docker compose -f docker-compose.dev.yml up` or `./start.sh --dev` (app)

- Image build/deploy:
  - `werf.yaml`
  - `next.config.ts` uses `output: 'standalone'`

## How To Approach Changes

When making changes, read these first:

1. `README.md`
2. `AGENTS.md`
3. `git status --short`
4. The relevant `src/lib/*` module before editing any route or component

Preferred change strategy:

- Keep changes narrow.
- Preserve one-time semantics unless the user explicitly requests a product change.
- Preserve client-side encryption unless the user explicitly requests a security model change.
- If you touch `secret-crypto.ts`, verify the full create -> open -> reveal path.
- If you touch `secret-store.ts`, `rate-limit.ts`, `valkey-client.ts`, or the API routes, verify TTL, consume-once, and brute-force-lockout behavior.
- If you touch `secret-viewer.tsx`, check both missing-fragment and mismatched-key cases.
- If you touch styling, keep the current visual language unless asked to redesign it.

## Known Constraints and Gaps

- Automated tests live under `src/**/*.test.ts` (Vitest). They mock Valkey via `ioredis-mock` in `vitest.setup.ts`.
- The app relies on browser Web Crypto APIs.
- Rate limiting is best-effort only; a Valkey outage currently fails open (allows requests).
- Secret storage is shared only through a single Valkey endpoint; Valkey itself is not clustered here.
- The project is small and intentionally avoids extra abstractions.

## Useful Mental Model

Think of Burnotes as:

- a client-side encryption app
- plus a tiny one-time encrypted blob relay
- backed by Valkey for durable, consume-once storage

If a proposed change makes the server aware of the plaintext secret, makes the link key leave the fragment, or makes secret consumption non-destructive, it changes the product's core behavior.
