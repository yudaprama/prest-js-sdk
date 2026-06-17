# prest-js-sdk

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
