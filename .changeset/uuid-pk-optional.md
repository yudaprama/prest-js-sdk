---
'prest-js-sdk': minor
---

feat: UUID primary key columns now optional in *Input types

LobeHub's Supabase schema uses text/varchar (not uuid) for PK columns
but stores UUID values (gen_random_uuid() cast to text, or
trigger-set). The pg-to-ts generator previously missed trigger-based
defaults, making `id: string` required in *Input types even though
the DB auto-fills it.

pg-to-ts now detects PK + UUID-ish type (uuid|text|varchar) and emits
`id?: string` in *Input types. Convention: UUID PKs are
server-generated. Client CAN still pass an explicit UUID (for
imports, deterministic IDs) — optional doesn't mean forbidden.

Only applies to single-column PKs (composite PKs still require all
key parts). Removes the need for `as any` casts on ~27 insert
payloads across lobehub services.
