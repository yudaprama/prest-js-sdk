# prest-js-sdk

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
