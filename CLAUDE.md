# prest-js-sdk

TypeScript SDK for pREST (PostgreSQL REST API). Wraps pREST's HTTP routes with route-shaped methods and a typed filter DSL.

## Repository

- GitHub: https://github.com/yudaprama/prest-js-sdk (publish target)
- npm: https://www.npmjs.com/package/prest-js-sdk (publish target)
- Base branch: `master`
- Node: 20

## AI agent guidelines

- **Never run Bun-based type checks locally** (for example `bun run check`, `bunx tsc --noEmit`, or any similar typecheck command). They are resource-heavy and are handled by GitHub Actions, so trust CI for type errors instead of validating them locally.

## Sibling project

This SDK mirrors `alist-kratos-sdk/` (the AList SDK in the parent `ai-orchestration` workspace). Same shape:

- Single-file SDK at `src/index.ts` (~500 lines)
- tsc direct build, ESM-only
- Changesets + GitHub Actions release flow
- `fromKratosSession()` static factory (forward-compat — pREST submodule does not yet wire Kratos)

When adding capabilities here, check whether `alist-kratos-sdk` has an analogous pattern to follow.

## Project layout

```
src/                 TypeScript source (entry: src/index.ts)
examples/            Standalone scripts (filter serializer test, smoke test)
dist/                Build output (gitignored)
.changeset/          Changeset markdown files (one per unreleased change)
.github/workflows/   GitHub Actions release.yml
.npmrc               Auth for npm publish (uses NPM_TOKEN)
package.json         Version, scripts, deps
```

## Build

```bash
npm ci                # install (CI uses lockfile)
npm run build         # tsc -> dist/
node examples/filters.ts   # sanity check the filter serializer
```

## pREST HTTP surface (the contract this SDK wraps)

The `prest/` submodule in the parent workspace is vanilla upstream pREST v2.0.0.
Routes (from `prest/router/router.go:17`):

| Method | Route | SDK method |
|---|---|---|
| GET | `/databases` | `databases()` |
| GET | `/schemas` | `schemas()` |
| GET | `/tables` | `tables()` |
| GET | `/{database}/{schema}` | `tablesIn(db, schema)` |
| GET | `/show/{database}/{schema}/{table}` | `showTable(db, schema, table)` |
| GET | `/{database}/{schema}/{table}` | `select(...)` |
| POST | `/{database}/{schema}/{table}` | `insert(...)` |
| POST | `/batch/{database}/{schema}/{table}` | `insertBatch(...)` |
| PUT, PATCH | `/{database}/{schema}/{table}` | `update(...)` |
| DELETE | `/{database}/{schema}/{table}` | `delete(...)` |
| ANY | `/_QUERIES/{location}/{script}` | `query(location, script, params)` |
| GET | `/_health` | `health()` |
| POST | `/auth` | `login(username, password)` |

**Filter URL syntax** (verified against `prest/adapters/postgres/postgres.go`):
- `?field=op.value` — operator-prefixed (op defaults to `eq` when bare)
- Multi-value ops: `?field=in.(1,2,3)` — parens, comma-separated
- Value-less ops: `?field=null`, `?field=true` — no trailing dot
- Reserved params (start with `_`): `_select`, `_order`, `_groupby`, `_join`, `_where`, `_count`, `_count_first`, `_limit`, `_offset`, `_page`, `_size`, `_distinct`, `_returning`, `_or`

Operators (`prest/adapters/postgres/postgres.go:1474` GetQueryOperator):
`eq, ne, gt, gte, lt, lte, in, nin, any, some, all, null, notnull, true, nottrue, false, notfalse, like, ilike, nlike, nilike` (+ ltree ops, not exposed in v0.1).

## Release workflow

Publishing is fully automated via **changesets** + GitHub Actions. **Do not run `npm version` or push tags manually.**

### How a release happens

1. A PR or direct push to `master` contains one or more `.changeset/<name>.md` files.
2. The `Release` workflow runs on push to `master`:
   - **If a "Version Packages" PR is already open**, it updates that PR with the new changesets.
   - **If no PR is open**, it creates one titled `chore(release): version packages`. This PR:
     - bumps `version` in `package.json` (consuming the changesets)
     - regenerates `CHANGELOG.md`
     - deletes the consumed changeset files
3. When a maintainer **merges the "Version Packages" PR**:
   - The same workflow runs on the merge commit
   - There are no more pending changesets, so it skips versioning and runs `npm run release` (`tsc` + `changeset publish`)
   - npm publish uses the `NPM_TOKEN` secret (granular token with **Bypass 2FA** enabled)

### Authoring a changeset

When a PR changes user-facing behavior, add a file under `.changeset/`:

```bash
npm run changeset
```

…or create the file manually:

```markdown
---
"prest-js-sdk": minor
---

Describe what changed and why. This text goes into CHANGELOG.md and the GitHub release notes.
```

Bump levels:
- `patch` — bug fix, internal refactor
- `minor` — new feature, backward-compatible
- `major` — breaking change

Skip a changeset for docs-only or CI-only changes.

### One-time setup (do this once when first publishing)

- `NPM_TOKEN` secret in repo Settings → Secrets → Actions (granular token, Bypass 2FA, Publish scope)
- Repo Settings → Actions → General → Workflow permissions: **Read and write permissions**, **Allow GitHub Actions to create and approve pull requests** enabled
- `NPM_TOKEN` env var is passed to the workflow and consumed by the repo's `.npmrc`

### Triggering the first publish

1. Ensure at least one `.changeset/*.md` exists on `master` (the `initial.md` is already there).
2. Push to `master` → workflow opens the "Version Packages" PR.
3. Review the PR (version bump, CHANGELOG entries look right).
4. Merge it → workflow publishes to npm.

### Manual override (emergency only)

```bash
npm login
npm run version-packages
npm run release
git push --follow-tags
```

**Do not do this routinely** — it bypasses the CHANGELOG PR review.

## Secrets & tokens

| Secret | Used by | Notes |
|---|---|---|
| `NPM_TOKEN` | Release workflow | Granular token, Bypass 2FA, Publish scope. Rotate if leaked. |
| `GITHUB_TOKEN` | Release workflow | Auto-provided by GitHub Actions; needs write perms + PR creation enabled. |

## Common tasks

| Task | Command |
|---|---|
| Add a changeset interactively | `npm run changeset` |
| Preview the next version locally | `npm run version-packages -- --snapshot` |
| Build types only | `npm run build` |
| Watch TS | `npm run dev` |
| Run filter test | `node examples/filters.ts` |
| Smoke test against running prest | `node examples/smoke.ts` (requires `planoctl up`) |
| Inspect a workflow run | `gh run list --repo yudaprama/prest-js-sdk --workflow=release.yml` |
| View logs | `gh run view <id> --repo yudaprama/prest-js-sdk --log` |
| Re-run a failed workflow | `gh run rerun <id> --repo yudaprama/prest-js-sdk` |

## Troubleshooting

- **`E404 Not Found` on publish** — `NPM_TOKEN` not reaching the publish step. Confirm `.npmrc` uses `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` and the env var is set on the `changesets/action` step.
- **`E403 ... 2FA required`** — The token was generated without "Bypass 2FA". Regenerate a granular token with that option enabled.
- **`GitHub Actions is not permitted to create or approve pull requests`** — Repo Settings → Actions → General → Workflow permissions: enable "Allow GitHub Actions to create and approve pull requests".
- **No "Version Packages" PR appears** — No `.changeset/*.md` files exist on `master`. Add one and push.
- **`npm ci` fails: lockfile out of sync** — Run `npm install` locally, commit `package-lock.json`, push.

## SDK API quick reference

```ts
import { PrestClient } from "prest-js-sdk";

const client = new PrestClient("http://localhost:3000");

// Catalog
await client.databases();
await client.schemas();
await client.tables();
await client.tablesIn("yarsew", "public");
await client.showTable("yarsew", "public", "users");

// CRUD with typed filter
await client.select("yarsew", "public", "billing_balances", {
  where: { actor_id: 42, status: { eq: "active" } },
  select: ["id", "amount"],
  order: ["amount:desc"],
  page: 1, size: 20,
});
await client.insert("yarsew", "public", "billing_balances", { actor_id: 42, amount: 100 });
await client.insertBatch("yarsew", "public", "billing_balances", [/* ... */]);
await client.update("yarsew", "public", "billing_balances", { actor_id: 42 }, { status: "frozen" });
await client.delete("yarsew", "public", "billing_balances", { actor_id: 42 });

// Stored SQL
await client.query("reports", "top_balances", { min: 1000 });

// Health + auth
await client.health();           // → boolean
await client.login("alice", "hunter2");  // → JWT, also stores internally
```

See `README.md` for full type definitions and the auth flow.
