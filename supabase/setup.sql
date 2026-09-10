-- Run this ONCE in your Supabase project: SQL Editor > New query > paste > Run.
-- It stores your access password as a secure hash (never the plain text) and
-- creates a function the website calls to check a typed password. The website
-- only ever learns "yes" or "no", never the password itself.

-- 1) Enable the crypto extension used to hash and compare the password.
create extension if not exists pgcrypto;

-- 2) A one-row table to hold the password hash. Nobody can read it from the API.
create table if not exists access_password (
  id int primary key default 1,
  password_hash text not null,
  constraint single_row check (id = 1)
);

-- 3) Store YOUR password as a hash. IMPORTANT: replace REPLACE_WITH_YOUR_PASSWORD
--    below with your real password JUST BEFORE you run this in Supabase. Do not
--    commit your real password to GitHub. To change the password later, run this
--    block again with the new text.
insert into access_password (id, password_hash)
values (1, crypt('REPLACE_WITH_YOUR_PASSWORD', gen_salt('bf')))
on conflict (id) do update set password_hash = excluded.password_hash;

-- 4) Lock the table: row-level security ON, and NO policies means the public API
--    cannot read the hash. Only the function below (step 5) can see it.
alter table access_password enable row level security;

-- 5) The check function. It compares a submitted password to the stored hash and
--    returns true/false. SECURITY DEFINER lets it read the locked table; it never
--    returns the hash or the password.
-- Note: search_path includes `extensions` because Supabase installs pgcrypto
-- (which provides crypt()) into the `extensions` schema, not `public`.
create or replace function check_access(pw text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from access_password
    where id = 1 and password_hash = crypt(pw, password_hash)
  );
$$;

-- 6) Allow anonymous website visitors to CALL the function (but not read the
--    table). This is what makes the password box on the site work.
grant execute on function check_access(text) to anon;
