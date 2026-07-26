-- Priority 5d — shared rate limiter (Supabase / Postgres).
--
-- Apply this in your Supabase project when SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY are configured. When those env vars are absent,
-- CEO Agent falls back to the in-memory InMemoryRateLimiter and this table
-- is not required. Consistent with the workflow persistence schema
-- (workflow-persistence-schema.sql) and memory_entries / memory_sessions
-- referenced by sdk/MemoryClient.js, the schema is operator-provisioned
-- rather than auto-migrated by the app.
--
-- Honesty note (see core/RateLimiter.js): SupabaseRateLimiter is a
-- count-then-insert sliding window, not a database-transaction-guarded
-- atomic counter. Prune old rows periodically (e.g. a scheduled `delete
-- from rate_limit_hits where hit_at < now() - interval '1 hour'`) — this
-- schema does not do that for you.

create table if not exists rate_limit_hits (
  id       bigint generated always as identity primary key,
  rate_key text not null,
  hit_at   timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_time_idx on rate_limit_hits (rate_key, hit_at);
