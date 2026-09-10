# Getting the Florida Facilities Tool live (with a password)

Plain-language steps. Two parts: **A) set up the password in Supabase**, then
**B) put the site on GitHub Pages**. Takes about 20-30 minutes the first time.

## What is protected (be honest with yourself)
- The **password** is stored safely in Supabase and checked on their servers, so
  it is NOT in your code. Even with a public repo, no one can read it.
- The site's **data files** (`/data/*.json`) are still downloadable by URL. That
  data comes from public sources (FL DOE, Census), so this is usually fine. Do
  not put anything truly private in `public/data`.

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
4. In the sidebar open **Project Settings** (gear) > **API**. Copy these two
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
   - `VITE_SUPABASE_URL` = the Project URL from Part A step 4
   - `VITE_SUPABASE_ANON_KEY` = the anon public key from Part A step 4
   - `VITE_GOOGLE_MAPS_API_KEY` = your Google Maps key (the map needs this; the
     rest of the site works without it)
5. Turn on Pages: repo **Settings > Pages**. Under **Build and deployment >
   Source**, choose **GitHub Actions**.
6. The included workflow (`.github/workflows/deploy.yml`) builds and publishes
   automatically. Watch it under the repo's **Actions** tab. When it finishes
   (green check, ~2 min), your site is live at `https://YOURUSERNAME.github.io`.
7. Visit the site. You should see the KIPP password screen. Type the password to
   get in. Share the link and the password with your team.

To change the password later: edit `supabase/setup.sql` (the text in step 3) and
re-run it in the Supabase SQL Editor. No code change or redeploy needed.

## If something goes wrong
- Password box says "Could not check the password": the two Supabase secrets are
  missing or wrong. Re-copy them in step B4 and re-run the Action.
- Site loads but no password screen: the Supabase secrets were not set, so the
  gate stays off. Add them and redeploy.
- Blank page / broken data: you likely used a normal-named repo instead of
  `username.github.io`. Ask the developer for the one-line base-path change.
