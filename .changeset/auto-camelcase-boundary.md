---
'prest-js-sdk': minor
---

feat: automatic snake_case → camelCase mapping at SDK boundary

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
