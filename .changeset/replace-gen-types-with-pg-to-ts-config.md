---
"prest-js-sdk": patch
---

Replace `scripts/gen-types.mjs` with a pg-to-ts config + `bun run gen-types` script.

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
