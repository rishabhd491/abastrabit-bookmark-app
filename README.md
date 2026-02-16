## Smart Bookmark

Smart Bookmark is a minimal bookmark manager built with Next.js (App Router) and Supabase. Users sign in with Google and manage a private list of bookmarks that stay in sync across tabs in real time.

### Tech stack

- Next.js App Router (TypeScript)
- Supabase (Auth, Database, Realtime)
- Tailwind CSS

---

## Features

- Google sign-in only (no email/password)
- Private bookmarks per user
- Add bookmark with URL + optional title
- Delete your own bookmarks
- Realtime updates across tabs via Supabase Realtime

---

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project at https://supabase.com and grab:

   - Project URL
   - `anon` public API key

3. Configure environment variables (locally and on Vercel):

   - `NEXT_PUBLIC_SUPABASE_URL` – your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` – your Supabase anon public key

4. Start the dev server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000 and sign in with Google.

---

## Supabase setup

### 1. Auth (Google only)

In your Supabase project:

- Go to **Authentication → Providers → Google** and turn it on.
- Set the redirect URLs (can be relaxed to the domain origin):
  - Local: `http://localhost:3000`
  - Production: your Vercel URL, for example `https://smart-bookmark.vercel.app`

Make sure the same values (especially the production URL) are used in Vercel as the `SITE_URL` (Project Settings → Authentication → URL configuration).

### 2. Database schema

Run the following SQL in the Supabase SQL editor:

```sql
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.bookmarks enable row level security;

create policy "Users can view their own bookmarks"
  on public.bookmarks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own bookmarks"
  on public.bookmarks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own bookmarks"
  on public.bookmarks
  for delete
  using (auth.uid() = user_id);
```

### 3. Realtime

Enable realtime on the `bookmarks` table so changes stream to the client:

```sql
alter publication supabase_realtime add table public.bookmarks;
```

This ensures inserts and deletes for a user’s bookmarks are pushed to all open tabs.

---

## How it works

- The app uses a single client-side page component (`src/app/page.tsx`) that:
  - Uses `supabase.auth.getUser()` and `onAuthStateChange` to track the signed-in user.
  - Fetches the current user’s bookmarks from `public.bookmarks`.
  - Subscribes to `postgres_changes` on the `bookmarks` table, filtered by `user_id`, to update the list in real time.
  - Inserts/deletes rows for the logged-in user only; RLS policies ensure users can only see and modify their own rows.
- The Supabase client is configured once in `src/lib/supabaseClient.ts` using the public URL and anon key from environment variables.

---

## Deployment (Vercel)

1. Push this project to a public GitHub repository.
2. In Vercel:
   - Create a new project from that GitHub repo.
   - Framework preset: **Next.js**.
   - Set environment variables for the project:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Ensure the Vercel project’s URL (e.g. `https://smart-bookmark.vercel.app`) is configured as `SITE_URL` / redirect URL in Supabase Auth.
3. Deploy.

Vercel will run `npm install`, `npm run lint`, and `next build`. In CI, make sure you use a Node version compatible with the Next.js version in `package.json` (Node 20.9+).

---

## Problems encountered and solutions

- **Node version mismatch for Next.js build**
  - Problem: `next build` requires Node `>=20.9.0`, while the local environment was on Node 18.
  - Solution: For deployment, configure the Vercel project (or local Node version via an `.nvmrc` or similar) to use Node 20.9+ so builds succeed.

- **Supabase Realtime with user-specific data**
  - Problem: Needed realtime updates, but only for bookmarks belonging to the logged-in user.
  - Solution: The client subscribes to `postgres_changes` on the `bookmarks` table with a `user_id` filter, and RLS policies enforce that users can only access their own rows.

- **React/ESLint rule about calling setState in effects**
  - Problem: The linter flagged synchronous `setState` calls inside `useEffect`.
  - Solution: State resets that are purely reactions to auth changes are handled inside the Supabase `onAuthStateChange` callback instead of directly in the effect, keeping effects focused on subscribing/unsubscribing to external systems.

- **Ensuring bookmarks are always private**
  - Problem: Needed to guarantee that one user can never see another user’s bookmarks, even if they try to query manually.
  - Solution: RLS policies on `public.bookmarks` check `auth.uid() = user_id` for select, insert, and delete operations. The client also always filters by `user_id`, but the policies enforce privacy at the database level.
