# prest-js-sdk

TypeScript SDK for [pREST](https://github.com/prest/prest) — PostgreSQL REST API. Route-shaped methods for catalog/CRUD/stored-queries, plus a typed filter DSL that serializes to pREST's `?field=op.value` URL syntax.

## Install

```bash
npm install prest-js-sdk
```

## Quick start

```ts
import { PrestClient } from "prest-js-sdk";

// Option 1: explicit URL (no auth — open prest)
const client = new PrestClient("http://localhost:3000");

// Option 2: URL + auth token (JWT from POST /auth, or Kratos session)
const client = new PrestClient({
  prestUrl: "http://localhost:3000",
  authToken: "eyJhbGci...",
});

// Option 3: auto-detect Kratos session (forward-compat — see Auth section)
const client = await PrestClient.fromKratosSession(
  "http://localhost:4433",   // Kratos public URL
  "http://localhost:3000",   // pREST URL (optional)
);
if (!client) throw new Error("No valid Kratos session");
```

## Catalog

```ts
await client.databases();                 // GET /databases
await client.schemas();                   // GET /schemas
await client.tables();                    // GET /tables
await client.tablesIn("yarsew", "public");          // GET /yarsew/public
await client.showTable("yarsew", "public", "users");  // GET /show/yarsew/public/users
```

## Select with typed filter

```ts
interface Balance { id: number; actor_id: number; amount: number; status: string }

const rows = await client.select<Balance>("yarsew", "public", "billing_balances", {
  where: {
    actor_id: 42,                       // shorthand → eq.42
    status: { eq: "active" },
    amount: { gte: 100 },
    name: { like: "foo%" },
  },
  select: ["id", "amount", "status"],
  order: ["amount:desc"],
  page: 1,
  size: 20,
});
```

## Insert / Update / Delete

```ts
// Insert single row
const [created] = await client.insert<Balance>(
  "yarsew", "public", "billing_balances",
  { actor_id: 42, amount: 99.95, status: "active" },
);

// Insert batch
await client.insertBatch("yarsew", "public", "billing_balances", [
  { actor_id: 1, amount: 10 },
  { actor_id: 2, amount: 20 },
]);

// Update — filter rows, then mutate
await client.update<Balance>(
  "yarsew", "public", "billing_balances",
  { actor_id: 42 },                       // WHERE
  { status: "frozen" },                   // SET
);

// Delete — filter rows
await client.delete("yarsew", "public", "billing_balances", { actor_id: 42 });
```

## Stored SQL queries

SQL files live under `<prest queries dir>/<location>/<script>.sql` and are invoked by name:

```ts
// Calls /_QUERIES/reports/top_balances?min=1000
const top = await client.query<Balance>("reports", "top_balances", { min: 1000 });
```

Inside the `.sql` file, params are available via pREST's template helpers:

```sql
SELECT * FROM billing_balances
WHERE amount >= {{ sqlVal "min" }}
ORDER BY amount DESC
LIMIT 100
```

## Filter DSL reference

| JS shape | URL emitted | SQL |
|---|---|---|
| `{ field: 42 }` | `?field=eq.42` | `field = 42` |
| `{ field: "x" }` | `?field=eq.x` | `field = 'x'` |
| `{ field: { ne: 42 } }` | `?field=ne.42` | `field != 42` |
| `{ field: { gt: 100 } }` | `?field=gt.100` | `field > 100` |
| `{ field: { gte: 100 } }` | `?field=gte.100` | `field >= 100` |
| `{ field: { lt: 100 } }` | `?field=lt.100` | `field < 100` |
| `{ field: { lte: 100 } }` | `?field=lte.100` | `field <= 100` |
| `{ field: { in: [1,2,3] } }` | `?field=in.(1,2,3)` | `field IN (1,2,3)` |
| `{ field: { nin: [1,2] } }` | `?field=nin.(1,2)` | `field NOT IN (1,2)` |
| `{ field: { like: "foo%" } }` | `?field=like.foo%25` | `field LIKE 'foo%'` |
| `{ field: { ilike: "foo%" } }` | `?field=ilike.foo%25` | `field ILIKE 'foo%'` |
| `{ field: null }` | `?field=null` | `field IS NULL` |
| `{ field: { notnull: true } }` | `?field=notnull` | `field IS NOT NULL` |
| `{ field: true }` | `?field=true` | `field IS TRUE` |

Multiple fields are AND-ed. For OR across fields, use `SelectOpts.or`:

```ts
client.select(..., {
  or: [
    { status: "active" },
    { amount: { gt: 1000 } },
  ],
});
// → ?_or=status=eq.active,amount=gt.1000
```

### `SelectOpts`

| Field | Maps to | Notes |
|---|---|---|
| `where` | `?field=op.value` | AND-ed; see table above |
| `select` | `_select=col1,col2` | column projection |
| `order` | `_order=col1,col2:desc` | suffix `:asc` / `:desc` per column |
| `page` + `size` | `_page`, `_size` | 1-indexed pagination |
| `limit` + `offset` | `_limit`, `_offset` | alternative pagination |
| `distinct` | `_distinct=true` | |
| `count` | `_count=true` | return row counts |
| `countFirst` | `_count_first=true` | single count object |
| `groupBy` | `_groupby=col1,col2` | |
| `or` | `_or=field=op.value,...` | OR-clause inside parens |
| `returning` | `_returning=col1,col2` | for update/delete |

## Auth

pREST supports two auth modes:

### 1. Database-backed (`[auth]` block in `prest.toml`)

```ts
const client = new PrestClient("http://localhost:3000");
const token = await client.login("alice", "hunter2");
// subsequent requests now carry Authorization: Bearer <token>
```

### 2. Kratos session (forward-compat)

The pREST submodule is vanilla upstream — it does not yet wire Ory Kratos. The
parent `ai-orchestration` project documents a planned `[auth.kratos]` integration;
once that lands, `PrestClient.fromKratosSession()` will work exactly like the
sibling `alist-kratos-sdk`:

```ts
const client = await PrestClient.fromKratosSession(
  "http://localhost:4433",
  "http://localhost:3000",
);
```

In Node (no cookie jar), pass the session token explicitly:

```ts
const client = await PrestClient.fromKratosSession(
  "http://localhost:4433",
  "http://localhost:3000",
  process.env.KRATOS_SESSION_TOKEN,
);
```

## Low-level escape hatch

For endpoints not wrapped by the typed methods:

```ts
const res = await client.request<{ some: shape }>("GET", "/custom/path", {
  params: new URLSearchParams({ foo: "bar" }),
  headers: { "X-Custom": "value" },
});
```

Throws `PrestApiError` (with `.status` and `.body`) on non-2xx.

## Browser vs Node

The SDK works in both browsers and Node 18+:

- `fromKratosSession()` reads the `ory_kratos_session` cookie in browsers; in Node pass the token explicitly.
- `fetch` is available natively in both runtimes.
- No DOM dependencies (only used for cookie reading).

## Development

```bash
npm install
npm run build      # tsc → dist/
npm run dev        # tsc --watch
node examples/filters.ts   # verify filter serializer
```

Releases are automated via changesets + GitHub Actions — see `CLAUDE.md` for the full flow.
