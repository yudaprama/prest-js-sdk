---
'prest-js-sdk': minor
---

feat: regenerate types after DB migration 0114 (close type gaps)

Regenerated `src/lobehub-types.ts` after running migration
`0114_close_type_gaps.sql` which:

1. Adds `metadata JSONB` to `sessions` (used by agent/session services)
2. Adds `interests`, `preference`, `guide`, `settings` to `user_settings`
3. Adds `DEFAULT now()` to `user_memories.last_accessed_at`
4. Adds `DEFAULT gen_random_uuid()::text` to child memory table IDs
5. Adds `DEFAULT gen_random_uuid()::text` to `generation_topics.id`

Result: these fields are now properly typed (optional in `*Input`
types), eliminating the need for `as any` casts in service code.
