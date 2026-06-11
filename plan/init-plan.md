# Cloudflare TypeScript Monorepo Plan

## Summary

Create a pnpm/Turborepo monorepo containing:

- `apps/web`: Next.js App Router, Tailwind CSS, shadcn/ui, deployed through OpenNext to Cloudflare Workers.
- `apps/api`: Hono REST API deployed as a separate public Cloudflare Worker.
- `packages/contracts`: shared Zod request/response schemas and TypeScript types.
- `packages/database`: Drizzle D1 schema, database factory, generated SQL migrations.
- Local, staging, and production environments with separate D1 databases.
- Foundation only: health endpoint, database connectivity check, error handling, CORS, tests, CI, and deployment scripts. Authentication and invoice features are deferred.

The browser and Next.js server will both call the public Hono API over HTTPS. No Worker service binding will be configured.

## Preparation Commands

Run these commands before editing application code.

```bash
cd /home/lmx/projects/invoice-hub

# Confirm the directory is safe to initialize.
pwd
find . -maxdepth 2 -type f -print
git status --short --branch 2>/dev/null || true

# Initialize Git only when this is not already a repository.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init

# Verify prerequisites.
node --version
corepack --version
git --version

# Activate the current pnpm release and record it in package.json.
# Note: corepack is deprecated upstream and slated for removal from newer
# Node releases; it still ships with Node 22 LTS. `corepack use` pins the
# exact resolved version into the `packageManager` field.
corepack enable
corepack use pnpm@latest

# Initialize the root package when package.json does not exist.
test -f package.json || pnpm init

mkdir -p apps packages
```

Create `pnpm-workspace.yaml`, the private root `package.json`, `.gitignore`, `.npmrc`, and shared TypeScript/Prettier configuration before running the generators. Configure workspace globs as `apps/*` and `packages/*`, and define a pnpm catalog with exact versions.

Then scaffold the applications:

```bash
# Generate Next.js already configured for Cloudflare Workers.
pnpm create cloudflare@latest apps/web --framework=next
```

Select:

- Language: TypeScript
- Router: App Router
- Tailwind CSS: enabled
- `src/` directory: enabled
- Import alias: `@/*`
- Deployment during setup: no

```bash
# Generate the Hono Worker.
pnpm create hono@latest apps/api
```

Select the `cloudflare-workers` TypeScript template and decline immediate deployment.

Scaffold the shared packages by hand (the generators above only create the two apps). Each needs a `package.json`, a strict `tsconfig.json` extending the shared base, and a `src/` directory:

```bash
mkdir -p packages/contracts/src packages/database/src
```

- `packages/contracts`: name `@invoice-hub/contracts`, exports Zod schemas and inferred types.
- `packages/database`: name `@invoice-hub/database`, exports Drizzle table schemas and `createDatabase`, plus a `db:generate` script for Drizzle Kit.

Remove nested Git metadata only if a generator created it:

```bash
test ! -d apps/web/.git || rm -rf apps/web/.git
test ! -d apps/api/.git || rm -rf apps/api/.git
```

Initialize shadcn/ui:

```bash
cd /home/lmx/projects/invoice-hub/apps/web
pnpm dlx shadcn@latest init
```

Select:

Recent shadcn CLI versions ask fewer questions and read most settings from `components.json`; accept defaults equivalent to:

- Style: New York
- Base color: Neutral
- CSS variables: enabled
- React Server Components: enabled
- Component alias: `@/components`
- Utility alias: `@/lib/utils`

Return to the repository root and install root tooling:

```bash
cd /home/lmx/projects/invoice-hub

pnpm add --save-dev --workspace-root \
  turbo \
  typescript \
  prettier \
  prettier-plugin-tailwindcss \
  eslint \
  vitest
```

After creating the package manifests and catalog entries, install application dependencies through exact catalog references:

```bash
pnpm --filter @invoice-hub/contracts add \
  zod

pnpm --filter @invoice-hub/api add \
  hono \
  zod \
  @hono/zod-validator \
  drizzle-orm \
  @invoice-hub/contracts@workspace:* \
  @invoice-hub/database@workspace:*

# vitest must be installed in the api package itself: pnpm does not hoist by
# default, and @cloudflare/vitest-pool-workers has a strict vitest peer range.
# Pin vitest to a version that range supports.
pnpm --filter @invoice-hub/api add --save-dev \
  wrangler \
  vitest \
  @cloudflare/vitest-pool-workers \
  @cloudflare/workers-types

pnpm --filter @invoice-hub/web add \
  zod \
  @invoice-hub/contracts@workspace:*

pnpm --filter @invoice-hub/database add \
  drizzle-orm \
  zod

pnpm --filter @invoice-hub/database add --save-dev \
  drizzle-kit \
  @cloudflare/workers-types

pnpm install
```

Move the installed version numbers into the root pnpm catalog and replace shared dependency versions in package manifests with `catalog:`. Internal dependencies must use `workspace:*`.

## Implementation Changes

### Monorepo Foundation

- Use package names `@invoice-hub/web`, `@invoice-hub/api`, `@invoice-hub/contracts`, and `@invoice-hub/database`.
- Configure Turbo tasks for `dev`, `build`, `typecheck`, `lint`, and `test`. Mark `dev` as `"persistent": true, "cache": false`; cache `build`, `typecheck`, `lint`, and `test`.
- Declare `NEXT_PUBLIC_API_URL` in the `env` key of the web build task in `turbo.json` so Turbo never replays a cached build baked with the wrong API URL.
- Enable strict TypeScript in every package, including `noUncheckedIndexedAccess`.
- Generate Cloudflare binding types through Wrangler rather than manually maintaining `Env`.
- Keep all Worker and D1 access out of browser bundles.

### Contracts and API

Expose these initial contracts:

```text
GET /health
200: { status: "ok", service: "api", timestamp: string }

GET /health/database
200: { status: "ok", database: "reachable" }
503: structured service-unavailable error
```

Use a common error shape:

```ts
{
  error: {
    code: string;
    message: string;
    requestId: string;
    issues?: Array<{ path: string; message: string }>;
  };
}
```

- Define every external request and response schema in `packages/contracts`.
- Infer TypeScript types from Zod; do not duplicate interfaces.
- Add Hono middleware for request IDs, secure headers, logging, CORS, and centralized error handling.
- Permit only the configured web origins. Local, staging, and production origins must be explicit.
- Do not reject requests that lack an `Origin` header: the Next.js server also calls the API, and server-to-server requests carry no `Origin`. CORS middleware governs browser behavior only; never add a hard origin check that blocks SSR calls.
- Keep `/health` independent of D1 so deployment health can be distinguished from database health.

### Database

- Bind D1 to the API Worker as `DB`.
- Wrangler named environments do not inherit bindings: `vars`, `d1_databases`, and all other bindings must be repeated in full inside `env.staging` and `env.production`. The top-level config serves local development.
- Give each environment its own worker `name` (e.g. `invoice-hub-api-staging`, `invoice-hub-api-production`) so staging and production deployments never overwrite each other.
- Export Drizzle table schemas and `createDatabase(binding: D1Database)` from `packages/database`.
- Use SQLite-compatible Drizzle column types and explicit indexes.
- Store generated SQL migrations under `packages/database/migrations`.
- Set `"migrations_dir": "../../packages/database/migrations"` on the D1 binding in the API `wrangler.jsonc` (in every environment block); `wrangler d1 migrations apply` reads migrations from there.
- Use Drizzle Kit only to generate migrations; use Wrangler to apply them.
- Never run migrations automatically during Worker startup.
- Configure separate D1 resources:
  - `invoice-hub-local`: Miniflare-managed local SQLite file. No remote resource exists and none should be created; the top-level `d1_databases` entry still requires `database_name`/`database_id` fields, and a placeholder ID is fine there.
  - `invoice-hub-staging`
  - `invoice-hub-production`

### Web Application

- Keep the App Router and default to React Server Components.
- Add a minimal shadcn-based landing/dashboard shell and API status display.
- Validate API responses with the shared Zod schemas.
- Use `NEXT_PUBLIC_API_URL` only for browser requests.
- `NEXT_PUBLIC_*` values are inlined at build time, so staging and production require separate `next build` runs with the correct value set. Use `CLOUDFLARE_ENV` (or the `--env` flag on `opennextjs-cloudflare build`) to select the wrangler environment per deploy.
- Configure:
  - Local: `http://localhost:8787`
  - Staging: staging API Worker URL
  - Production: production API custom domain or Worker URL
- Use the OpenNext Cloudflare adapter and retain separate `dev`, `preview`, and `deploy` scripts (`preview`/`deploy` wrap `opennextjs-cloudflare build && opennextjs-cloudflare preview|deploy`).

## Cloudflare Setup Commands

Authenticate and inspect the account:

```bash
cd /home/lmx/projects/invoice-hub

pnpm dlx wrangler@latest login
pnpm dlx wrangler@latest whoami
```

Create the remote databases:

```bash
pnpm dlx wrangler@latest d1 create invoice-hub-staging
pnpm dlx wrangler@latest d1 create invoice-hub-production
```

Copy each returned `database_id` into the API `wrangler.jsonc` environment configuration. Do not commit credentials or API tokens.

Generate Worker binding types after completing `wrangler.jsonc`:

```bash
pnpm --filter @invoice-hub/api exec wrangler types
pnpm --filter @invoice-hub/web exec wrangler types
```

Generate and apply the initial migration:

```bash
pnpm --filter @invoice-hub/database run db:generate

# Local D1
pnpm --filter @invoice-hub/api exec wrangler d1 migrations apply invoice-hub-local --local

# Remote staging
pnpm --filter @invoice-hub/api exec wrangler d1 migrations apply invoice-hub-staging --remote

# Production only after staging verification
pnpm --filter @invoice-hub/api exec wrangler d1 migrations apply invoice-hub-production --remote
```

Start local development:

```bash
# Terminal 1
pnpm --filter @invoice-hub/api dev

# Terminal 2
pnpm --filter @invoice-hub/web dev
```

Run Cloudflare-accurate previews before deployment:

```bash
pnpm --filter @invoice-hub/api preview
pnpm --filter @invoice-hub/web preview
```

## Verification and Deployment

Run the complete verification pipeline:

```bash
cd /home/lmx/projects/invoice-hub

pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Verify API behavior:

```bash
curl --fail http://localhost:8787/health
curl --fail http://localhost:8787/health/database
```

Deploy API first because the web application depends on its URL:

```bash
pnpm --filter @invoice-hub/api deploy:staging
pnpm --filter @invoice-hub/web deploy:staging
```

After staging smoke tests:

```bash
pnpm --filter @invoice-hub/api deploy:production
pnpm --filter @invoice-hub/web deploy:production
```

CI must run install, lint, typecheck, tests, and builds for pull requests. Both staging and production deployments must apply reviewed D1 migrations before deploying the API, then deploy the web Worker, so staging rehearses the exact production pipeline.

CI authenticates to Cloudflare through `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets (for example via `cloudflare/wrangler-action`). Never commit these values.

## Test Plan

- Zod contract tests for valid and invalid API payloads and responses.
- Hono tests for health endpoints, request IDs, structured errors, CORS allow/deny behavior (including requests with no `Origin` header, which must succeed), and unavailable D1 bindings.
- Database integration test against local D1 for a simple indexed query.
- Web test for successful, unavailable, and malformed API status responses.
- Production-runtime smoke tests through the package `preview` scripts (`opennextjs-cloudflare preview` for web, `wrangler dev` for the API), not only Node-based `next dev`.
- Staging deployment test confirming both Workers, D1 connectivity, environment variables, CORS, and source maps.

## Assumptions

- The repository is empty or contains no implementation that must be preserved.
- Node.js 22 LTS or a later Cloudflare-supported LTS release is installed.
- Dependency versions are exact and centralized through the pnpm catalog.
- The API is intentionally public; authorization will be added before business data endpoints.
- Local, staging, and production use separate D1 state.
- Invoice, customer, authentication, and payment functionality are outside this foundation phase.
