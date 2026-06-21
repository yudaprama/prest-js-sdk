---
'prest-js-sdk': minor
---

feat: regenerate lobehub-types.ts with user_id-optional fix + string dates

Regenerate `src/lobehub-types.ts` against the local pg-to-ts fork
(`../pg-to-ts`) which carries two fixes the upstream 4.1.1 npm
package doesn't:

1. **`user_id` is always optional in `*Input` types.** pREST's
   `[[auth.user_id_filters]]` middleware injects user_id from the
   Kratos session on INSERT/UPDATE, so clients never pass it. The
   generated types now reflect that runtime contract: `user_id?:
   string` instead of `user_id: string`. `requiredForInsert` arrays
   drop `user_id` too.

2. **`tsvector` columns map to `string`, `vector` (pgvector) columns
   map to `number[]`.** Upstream 4.1.1 leaves both as `any` with a
   console warning. The fork's `src/schemaPostgres.ts` adds the
   mappings explicitly.

Also pass `--dates-as-strings` to `gen-types` so `date` /
`timestamp` / `timestamptz` columns stay as `string` (matches the
SDK's pre-existing type shape; upstream default is `Date`).

`gen-types` script now invokes `bun ../pg-to-ts/dist/cli.js` (local
fork) instead of `bunx pg-to-ts@4.1.1` (upstream npm).

Drop an accidental circular self-dependency (`prest-js-sdk` in its
own `dependencies`) from `package.json`.

Backward-compatible for most consumers:

- `TableTypes[K]['select']` shapes are unchanged (same column names,
  same types).
- `TableTypes[K]['input']` shapes: `user_id` is now optional. Code
  that passed `user_id` explicitly still type-checks. Code that
  relied on the middleware (didn't pass user_id) no longer needs
  `as any` casts.
- `LobehubClient` (which defaults `camelCase: true` + uses
  `CamelTableTypes`) is unaffected: camelCased outputs don't include
  `user_id` shape concerns for consumers.
