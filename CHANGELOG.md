# prest-js-sdk

## 0.7.0

### Minor Changes

- 220e381: feat: automatic snake_case → camelCase mapping at SDK boundary

  pREST returns Postgres column names verbatim (snake_case), but most JS/TS
  consumers expect camelCase. This release adds a `camelCase?: boolean`
  option to all row-returning methods so the mapping happens once at the
  client layer instead of at every call site.

  **New:**

  - `src/camelize.ts` with recursive `camelizeKey` / `camelizeKeys` helpers
    (exported from the package root for reuse).
  - `SelectOpts.camelCase` plus `{ camelCase?: boolean }` on `insert`,
    `insertBatch`, `update`, `delete`, and `query` in `PrestClient` and
    `TypedPrestClient`. Option is stripped before URL serialization — never
    sent to pREST.
  - `LobehubClient` (in `prest-js-sdk/lobehub`) **defaults to camelCase**
    on all methods: `select` / `insert` / `insertBatch` / `update` /
    `delete` / `query` / `agentSharesByUser` / `recentByUser`. Pass
    `{ camelCase: false }` per call to keep raw snake_case keys.
  - `RecentItem` and `AgentShareRow` result interfaces now declare
    camelCase keys (matching what LobehubClient returns by default).
    Snake_case shapes kept as `RecentItemRaw` / `AgentShareRowRaw`.

  **Backward-compatible:**

  - `PrestClient` / `TypedPrestClient` default to snake_case (unchanged).
    Only `LobehubClient` defaults to camelCase.
  - Existing callers without the `camelCase` option keep the previous
    behavior; the new flag is opt-in for the base client.

### Patch Changes

- 220e381: Replace `scripts/gen-types.mjs` with a pg-to-ts config + `bun run gen-types` script.

  The hand-rolled `gen-types.mjs` was a regex parser over the SQL dump that did not know about pgvector (`vector` columns fell through to `unknown`) and had silently drifted from pg-to-ts's full output (it produced the simpler `LobehubTables` map; pg-to-ts produces the `TableTypes` + `tables` map that `TypedPrestClient` requires). Using pg-to-ts as the single source of truth keeps the generated `src/lobehub-types.ts` aligned with the SDK's type contract.

  What changed in `prest-js-sdk/`:

  - `pg-to-ts.json` — pg-to-ts generator config: 107 lobehub tables (down from 116 — the 9 dropped Better Auth / NextAuth tables removed), `output: "src/lobehub-types.ts"`, `schema: "public"`. No DSN stored — connection comes from the `PREST_PG_URL_LOBEHUB` env var in the parent workspace's `.env`.
  - `package.json` — added `gen-types` script (uses `bun ../pg-to-ts/dist/cli.js generate --config pg-to-ts.json` with `PG_TO_TS_CONN=$PREST_PG_URL_LOBEHUB` inline); added `pg-to-ts: "file:../pg-to-ts"` devDependency.
  - `scripts/gen-types.mjs` and the `scripts/` directory — deleted.
  - `.gitignore` — added `bun.lock` and `bun.lockb`.
  - `CLAUDE.md` — documented the regeneration procedure, the bun-vs-node shebang gotcha, the tsconfig-disable patch in pg-to-ts, the `NODE_TLS_REJECT_UNAUTHORIZED=0` requirement, and why 107 (not 116) tables.
  - `CHANGELOG.md` 0.4.0 entry — points at the new config + script.
  - `src/lobehub-types.ts` — regenerated. 215 interfaces (107 × 2 + `TableTypes`), 5332 lines, no empty interfaces, vector columns correctly typed as `number[] | null`.

  What changed in `pg-to-ts/` (the sibling fork):

  - `src/index.ts` — `formatterOption` now has `tsconfig: false` and `tslint: false` (was `true`). The bundled `typescript-formatter` cannot parse prest-js-sdk's modern tsconfig (`target: "ES2022"`, `moduleResolution: "bundler"`, etc.) and throws on unknown options. Disabling tsconfig/tslint discovery in the formatter is the targeted fix.

  What changed in the workspace `.env`:

  - `NODE_TLS_REJECT_UNAUTHORIZED=0` — Supabase's pooler uses self-signed certs; without this, pg-to-ts throws `SELF_SIGNED_CERT_IN_CHAIN`. Already a documented pattern in the lobehub submodule's `.env.example.development`.

  Regenerate after schema changes:

  ```bash
  set -a; source ../.env; set +a
  bun run gen-types
  ```

  First-time setup, one-time per clone:

  ```bash
  ( cd ../pg-to-ts && bun install && bun run build )
  ( cd ../prest-js-sdk && bun install )
  ( cd ../pg-to-ts && bun link )
  ( cd ../prest-js-sdk && bun link pg-to-ts )
  ```

## 0.4.0

### Minor Changes

- 3669d39: Add typed table client and generated LobeHub schema types

  - New `PrestClient.forSchema<Tables>(database, schema)` factory returns a
    `TypedPrestClient<Tables>` scoped to a single database + schema. All CRUD
    methods (`select` / `insert` / `insertBatch` / `update` / `delete`) become
    constrained to the table map's keys and row types — no manual generics at
    call sites.
  - New `TypedPrestClient<Tables>` class + `TableMap` interface. The shape
    matches `pg-to-ts`'s `TableTypes` output
    (`{ [table]: { select: RowType; input: InsertType } }`), so generated types
    drop in directly.
  - New `lobehubClient(client)` helper (in `src/lobehub.ts`) bound to the
    LobeHub `public` schema with full typing via `lobehub-types.ts`.
  - Auto-generated `src/lobehub-types.ts` (~5,600 lines) covering all 100+
    LobeHub tables (select + input row types + `tables` export).
  - `scripts/gen-types.mjs` — standalone schema.sql → TypeScript row types
    generator (no DB connection needed at build time).

## 0.3.0

### Minor Changes

- ee94ad0: Add `tsquery()` helper for Postgres full-text search

  - New `tsquery(q, config?)` helper that serializes to pREST's suffix-syntax
    filter: `?col$tsquery=value` (or `?col$tsquery(english)=value` with config).
  - `Operator` union extended with `"tsquery"` and `"tsquery(english)"` so the
    manual object form `{ col: { tsquery: "..." } }` also type-checks.
  - Serializer detects the tsquery operator and emits `field$tsquery=value`
    instead of the usual `field=op.value` shape (matches
    `adapters/postgres/postgres.go::case "tsquery"`).
  - `Filter` and `select()` doc comments updated to point at the helper and
    the new prest Tier 2 templates (`messagesSearchFts`, `topicsSearchFts`).

## 0.2.0

### Minor Changes

- 6012e3a: Initial release. PrestClient with catalog, CRUD, stored-query, health, and login methods;
  typed Filter / SelectOpts DSL that serializes to pREST's `?field=op.value` URL syntax;
  fromKratosSession() factory for forward-compat with the planned Kratos auth integration.
