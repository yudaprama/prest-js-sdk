---
"prest-js-sdk": minor
---

Add typed table client and generated LobeHub schema types

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
