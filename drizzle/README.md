# Migrations

`0000`–`0019` are historical and already folded into `../supabase/schema.sql`,
which is what a fresh database should run. They are kept for reference.

New schema changes: add `0020_description.sql` (idempotent), run it by hand in
the Supabase SQL editor, then ship the code. See HANDOFF.md §6.
