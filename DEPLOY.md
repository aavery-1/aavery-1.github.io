# Getting the Florida Facilities Tool live (with a password)

Plain-language steps. Two parts: **A) set up the password in Supabase**, then
**B) put the site on GitHub Pages**. Takes about 20-30 minutes the first time.

## What is protected (be honest with yourself)
- The **password** is stored as a strong hash in Supabase and checked on their
  servers, so it is NOT in your code. Guesses are limited to 10 per network
  address per 15 minutes.
- A correct password returns a **12-hour session token**. Private data (the KIPP
  requested-building list) lives only in Supabase and is sent only to a browser
  holding a valid token, so it is not in the public code or the public repo.
- The site's **data files** (`/data/*.json`) and the code are still downloadable
  by URL, and the GitHub repo is public. That data comes from public sources
  (FL DOE, Census). Anything private goes in Supabase (`private_config`), never
  in `public/data` or `src/`.

---

## Part A - Supabase (store the password)

1. Go to https://supabase.com, sign up (free), and click **New project**. Pick any
   name and a database region near you. Wait ~2 minutes for it to finish.
2. In the left sidebar open **SQL Editor** > **New query**.
3. Open the file `supabase/setup.sql` in this project, copy ALL of it, and paste
   it into the query box. Find `REPLACE_WITH_YOUR_PASSWORD` and type your real
   password in its place. Then click **Run**. You should see "Success".
   - Only type the real password here in Supabase. Do NOT save it into the file
     you push to GitHub, so it never appears in your public code. To change the
     password later, run this step again with new text.
4. Still in the SQL Editor, open a **New query**, paste ALL of
   `supabase/002_session_gate.sql`, and **Run** it. This adds the session token,
   the guess limit, and the locked table for private data.
5. Run your private seed: `supabase/private_seed.local.sql`. It is gitignored, so
   it only exists on the machine that has it (ask the developer for a copy). It
   loads the private building list. Paste the whole file and Run; nothing needs
   uncommenting. Optionally type the real password on its `new_pw` line (in the
   SQL Editor only) to re-store it with a stronger hash.
6. In the sidebar open **Project Settings** (gear) > **API**. Copy these two
   values, you will need them in Part B:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string). The `anon` one, NOT `service_role`.

---

## Part B - GitHub Pages (put the site online)

1. Create a GitHub account if you do not have one: https://github.com
2. Create a new repository. **Simplest option that works with no extra setup:**
   name it exactly `YOURUSERNAME.github.io` (replace with your real username),
   set it to **Public**, and create it. (This makes the site live at
   `https://YOURUSERNAME.github.io`, served from the root, which this app needs.)
   - Note: you can only have one `username.github.io` site. If that name is
     already taken by another project, tell the developer - a normal-named repo
     needs one extra config change.
3. Upload this project's files to that repo. Two ways:
   - Easy: on the repo page click **Add file > Upload files**, drag in everything,
     and commit. (Skip the `node_modules` and `dist` folders if present.)
   - Or with Git: `git init`, `git add .`, `git commit -m "first"`,
     `git branch -M main`, `git remote add origin <repo URL>`, `git push -u origin main`.
4. Add your keys as secrets: repo **Settings > Secrets and variables > Actions >
   New repository secret**. Add these three (names must match exactly):
   - `VITE_SUPABASE_URL` = the Project URL from Part A step 6
   - `VITE_SUPABASE_ANON_KEY` = the anon public key from Part A step 6
   - `VITE_GOOGLE_MAPS_API_KEY` = your Google Maps key (the map needs this; the
     rest of the site works without it)
   - `VITE_MAPBOX_TOKEN` = your Mapbox public token (pk.*), for traffic-aware drive times. Restrict it to the site URL in your Mapbox account. Without it, drive times fall back to empty-road routing.
5. Turn on Pages: repo **Settings > Pages**. Under **Build and deployment >
   Source**, choose **GitHub Actions**.
6. The included workflow (`.github/workflows/deploy.yml`) builds and publishes
   automatically. Watch it under the repo's **Actions** tab. When it finishes
   (green check, ~2 min), your site is live at `https://YOURUSERNAME.github.io`.
7. Visit the site. You should see the KIPP password screen. Type the password to
   get in. Share the link and the password with your team.

To change the password later, run this in the Supabase SQL Editor (type the real
password only there, never in a file you commit). No redeploy needed:

```sql
update access_password set password_hash = crypt('NEW_PASSWORD', gen_salt('bf', 12)) where id = 1;
delete from access_session; -- signs everyone out so the new password takes effect now
```

To change the private building list, edit `private_config` the same way (see
`supabase/private_seed.local.sql`). Visitors pick it up on their next sign-in.

## Part C - Live news card (optional)

The school inspector has an "In the news" card that lists recent headlines
mentioning the school. The headlines come from a small Supabase Edge Function
(`supabase/functions/school-news`) that fetches Google News on the server, so the
browser is not blocked by cross-site rules. It is FREE (no news API key) and, if
you skip this part, the card simply says "Live headlines aren't set up" and
nothing else breaks.

To turn it on, once, from the project folder:

1. Install the Supabase CLI (one time): https://supabase.com/docs/guides/cli
2. Log in and link to the same project as the password gate:
   - `supabase login`
   - `supabase link --project-ref YOUR_PROJECT_REF` (the `abcd1234` from your
     Project URL)
3. Deploy the function:
   - `supabase functions deploy school-news`

Local development needs none of this: `npm run dev` fetches headlines through a
dev-only proxy in `vite.config.ts`, so the card works without Supabase keys.

That's it. The site already knows how to call it (it reuses the same two Supabase
secrets from Part A). The function only answers visitors who have unlocked the
site, and only from the site's own address. If you move the site, update
`ALLOWED_ORIGINS` in the function and redeploy it. Reload the site and open any school; headlines appear at the
bottom of the inspector. The card is an external, unverified feed - it matches on
the school name, so an occasional unrelated article can appear.

## If something goes wrong
- Password box says "Could not check the password": the two Supabase secrets are
  missing or wrong. Re-copy them in step B4 and re-run the Action.
- Password box says "Too many attempts": that network made more than 10 wrong
  guesses in 15 minutes. Wait, or clear the counter in Supabase:
  `delete from access_attempt;`
- Signed in but the open KIPP "requested building" rings are missing: run
  `supabase/002_session_gate.sql` and the private seed (Part A steps 4-5).
- Site loads but no password screen: the Supabase secrets were not set, so the
  gate stays off. Add them and redeploy.
- Blank page / broken data: you likely used a normal-named repo instead of
  `username.github.io`. Ask the developer for the one-line base-path change.
