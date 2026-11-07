-- Run this ONCE in your Supabase project, AFTER setup.sql:
--   SQL Editor > New query > paste this whole file > Run.
--
-- What it changes, and why:
--   1. The password check now hands back a short-lived SESSION TOKEN instead of a
--      bare true/false. Before, the site only remembered "unlocked = 1" in the
--      browser, which anyone could set by hand to skip the screen.
--   2. Password guesses are rate limited: 10 tries per network address per 15
--      minutes (plus a site-wide backstop), checked BEFORE the slow hash runs.
--   3. Private data (the KIPP requested-building list) moves OUT of the public
--      website code and into a locked table. The site can only read it with a
--      valid session token, so a password is required to see it.
--   4. The old unthrottled check_access() is closed to the public.
--
-- After running this file, run your PRIVATE seed (supabase/private_seed.local.sql,
-- which is gitignored and never committed) to load the private values and to
-- re-store the password with a stronger hash. Safe to re-run.

create extension if not exists pgcrypto;

-- ── Tables (row-level security ON, no policies: the public API cannot read them)
create table if not exists access_session (
  token_hash text primary key,
  expires_at timestamptz not null
);
alter table access_session enable row level security;

create table if not exists access_attempt (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
alter table access_attempt enable row level security;
create index if not exists access_attempt_ip_at on access_attempt (ip, at);

create table if not exists private_config (
  key text primary key,
  value jsonb not null
);
alter table private_config enable row level security;

-- ── Helpers
-- The caller's network address as Supabase's gateway reports it. Cloudflare
-- sets cf-connecting-ip and overwrites any value a client sends, so prefer it.
create or replace function access_request_ip()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip', ''),
    nullif(trim(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
$$;

create or replace function access_token_hash(token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(coalesce(token, ''), 'sha256'), 'hex');
$$;

-- ── unlock(pw): rate-limited password check that returns a session token, or
-- null for a wrong password. Raises HTTP 429 when the address is over its limit.
create or replace function unlock(pw text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := access_request_ip();
  v_recent int;
  v_global int;
  v_token text;
begin
  -- Housekeeping, so the tables stay tiny.
  delete from access_attempt where at < now() - interval '1 day';
  delete from access_session where expires_at < now();

  -- Count this try first, then check the limits, so a flood of guesses is
  -- refused before the (deliberately slow) password hash ever runs.
  insert into access_attempt (ip) values (v_ip);
  select count(*) into v_recent from access_attempt
    where ip = v_ip and at > now() - interval '15 minutes';
  select count(*) into v_global from access_attempt
    where at > now() - interval '15 minutes';
  if v_recent > 10 or v_global > 500 then
    raise exception 'too_many_attempts' using errcode = 'PT429';
  end if;

  if not exists (
    select 1 from access_password
    where id = 1 and password_hash = crypt(coalesce(pw, ''), password_hash)
  ) then
    return null;
  end if;

  -- Correct password: clear this address's strikes and issue a 12-hour token.
  -- Only the token's SHA-256 is stored, so a leaked table cannot be replayed.
  delete from access_attempt where ip = v_ip;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into access_session (token_hash, expires_at)
    values (access_token_hash(v_token), now() + interval '12 hours');
  return v_token;
end;
$$;

-- ── session_valid(token): true while a token is unexpired. Used by the
-- school-news Edge Function so only unlocked visitors can use it.
create or replace function session_valid(token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from access_session
    where token_hash = access_token_hash(token) and expires_at > now()
  );
$$;

-- ── private_data(token): every private_config row as one JSON object, or null
-- when the token is missing or expired (the site then asks for the password).
create or replace function private_data(token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when session_valid(token)
      then coalesce((select jsonb_object_agg(key, value) from private_config), '{}'::jsonb)
    else null
  end;
$$;

-- ── Permissions. Supabase lets the public (anon) role run any new function in
-- the public schema by default, so revoke everything, then grant back only the
-- three the website calls.
revoke execute on function access_request_ip() from public, anon, authenticated;
revoke execute on function access_token_hash(text) from public, anon, authenticated;
revoke execute on function unlock(text) from public, anon, authenticated;
revoke execute on function session_valid(text) from public, anon, authenticated;
revoke execute on function private_data(text) from public, anon, authenticated;
grant execute on function unlock(text) to anon;
grant execute on function session_valid(text) to anon;
grant execute on function private_data(text) to anon;

-- The old yes/no check had no rate limit; close it now that unlock() replaces it.
revoke execute on function check_access(text) from public, anon, authenticated;
