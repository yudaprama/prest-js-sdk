---
"prest-js-sdk": minor
---

Add `tsquery()` helper for Postgres full-text search

- New `tsquery(q, config?)` helper that serializes to pREST's suffix-syntax
  filter: `?col$tsquery=value` (or `?col$tsquery(english)=value` with config).
- `Operator` union extended with `"tsquery"` and `"tsquery(english)"` so the
  manual object form `{ col: { tsquery: "..." } }` also type-checks.
- Serializer detects the tsquery operator and emits `field$tsquery=value`
  instead of the usual `field=op.value` shape (matches
  `adapters/postgres/postgres.go::case "tsquery"`).
- `Filter` and `select()` doc comments updated to point at the helper and
  the new prest Tier 2 templates (`messagesSearchFts`, `topicsSearchFts`).
