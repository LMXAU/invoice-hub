# Design: Keep Worker & D1 access out of browser bundles

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Problem

The monorepo ships a browser bundle from `apps/web` (Next.js on Cloudflare via
`@opennextjs/cloudflare`). Cloudflare D1 and Worker-runtime access live in
`packages/database` (`@invoice-hub/database`, built on `drizzle-orm`) and are
consumed by the `apps/api` Hono Worker. Nothing prevents a developer from
importing the database package — or `drizzle-orm`, or a `cloudflare:*` builtin —
into web code, where it would be bundled and shipped to the browser. That would
leak server-only/D1 code into the client and likely break the build at runtime.

There is no manual `Env` or existing leak today; this is a **guardrail** to keep
it that way.

## Decisions

- **Architecture:** `apps/web` is a pure frontend. All data access happens via
  HTTP calls to the `apps/api` Worker. `web` never depends on
  `@invoice-hub/database`, and never performs D1/Worker data access itself
  (server or client).
- **Enforcement:** ESLint `no-restricted-imports`, run in CI via the `lint`
  task. No runtime poison pill, no dependency-tree scanner.
- **Scope:** both `apps/web` and `packages/contracts`. `contracts` is the only
  workspace package that is actually bundled into the browser (web imports it),
  so it must stay browser-safe to prevent a transitive leak.

## Components

### 1. Fix web's lint command (prerequisite)

`apps/web/package.json`: change `"lint": "next lint"` to `"lint": "eslint ."`.

`next lint` was removed in Next.js 16 (the app is on `next@16.2.6`); the current
script is already broken — it interprets `lint` as a directory argument. The
guardrail is only meaningful if `lint` actually runs, so this fix is required.
ESLint v9 (flat config) and the flat `eslint.config.mjs` are already present.

### 2. Boundary rule in web

`apps/web/eslint.config.mjs`: append a config block adding `no-restricted-imports`
(error) for:

- `@invoice-hub/database` and `@invoice-hub/database/*`
- `drizzle-orm` and `drizzle-orm/*`
- pattern `cloudflare:*` (e.g. `cloudflare:workers`)

Applied to **all** web source, not only `"use client"` files — since web never
does D1 access at all, an everywhere-ban is the strongest guarantee nothing
reaches the browser. Each restriction carries a message pointing developers to
call the api Worker over HTTP instead.

`@cloudflare/workers-types` is intentionally **not** banned: it is type-only and
erased at build time, so banning it would produce false positives.
`@opennextjs/cloudflare` is **not** banned: web legitimately needs the adapter.

### 3. Boundary rule in contracts

`packages/contracts` currently has no ESLint config. Add:

- `packages/contracts/eslint.config.mjs` — minimal flat config with the same
  `no-restricted-imports` restrictions (`@invoice-hub/database*`, `drizzle-orm*`,
  `cloudflare:*`).
- `"lint": "eslint ."` script in `packages/contracts/package.json`, plus
  `eslint` as a devDependency referencing `catalog:`.

This keeps the browser-bound shared package from transitively importing D1/Worker
code.

### 4. Turbo coverage

The root `turbo.json` already defines a cached `lint` task. web's `lint` script
exists (after fix); adding contracts' `lint` script means `turbo run lint`
covers both. No `turbo.json` change required.

## Data flow (unchanged)

```
browser  ──HTTP──▶  apps/api (Hono Worker)  ──▶  @invoice-hub/database  ──▶  D1
   │
   └── imports @invoice-hub/contracts (zod schemas, browser-safe)
apps/web (Next on Workers) ── renders UI, calls api over HTTP
```

## Verification

Temporarily add `import '@invoice-hub/database'` to a file in both `apps/web`
and `packages/contracts`, run `pnpm turbo run lint`, and confirm it fails in
both packages with the custom message. Remove the temporary imports and confirm
lint passes.

## Out of scope (YAGNI)

- `server-only` poison-pill package.
- Dependency-tree / bundle scanner in CI.
- Banning `@opennextjs/cloudflare` or `@cloudflare/workers-types`.
- Any change to `apps/api` (the Worker is the correct place for D1 access).
