---
'prest-js-sdk': minor
---

feat: type-level CamelTableTypes for auto-camelCase select types

Add type utilities that let TypeScript track the SDK's runtime
auto-camelCase mapping at the type level, so consumers stop needing
unsafe `as unknown as CamelType[]` casts:

- `CamelizeKey<S>` — converts a snake_case string literal to camelCase
  at the type level (recursive; handles `user_id`, `created_at`,
  `agent_cron_jobs`, etc.).
- `CamelKeys<T>` — maps an object type's keys through CamelizeKey,
  leaving values unchanged.
- `CamelTableTypes` — TableMap variant where `select` shapes are
  camelCase (matching LobehubClient's default auto-camelCase runtime)
  and `input` shapes stay snake_case (DB column names for INSERT/UPDATE
  payloads, which must remain snake_case regardless of what the SDK
  does to responses).

LobehubClient now wraps `TypedPrestClient<CamelTableTypes>` (was
`TypedPrestClient<TableTypes>`). Consequence:

  const db = lobehubClient(client);
  const rows = await db.select('topics', { where: { user_id: 'u1' } });
  // rows: { id, title, createdAt, updatedAt, agentId, ... }[]  ← camelCase
  // insert/update payloads still take { agent_id, created_at, ... }  ← snake

The raw `TableTypes` and `tables` const are still exported for callers
who want the un-camelCased shape (or build their own typed client on
top of `PrestClient.forSchema`).

Backward-compatible:

- No runtime behavior change (auto-camelCase was already default on
  LobehubClient since 0.7.0).
- Only the static return type of LobehubClient methods changed from
  snake_case to camelCase.
- Consumers already casting `as unknown as ChatTopic[]` will see their
  cast become redundant — the cast still compiles, just no longer
  needed. They can be removed opportunistically.
