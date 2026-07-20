# Supabase Setup

> Legacy reference only. Supabase is no longer used by the running app. Follow
> `CLOUDFLARE_SETUP.md` for the current local and public release process. This
> file and the `supabase/` migration history remain temporarily as a record of
> the former backend while the Cloudflare replacement is validated.

Use a dedicated Supabase project for this app.

## Hosted Project

1. Create a new Supabase project named `Scavenger Blackout`.
2. In Auth settings, enable anonymous sign-ins.
3. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Link and apply migrations:

```sh
supabase link --project-ref <new-project-ref>
supabase db push
```

The migrations seed a generic starter template:

- Initial game code: `STARTER`
- Groups: Team 1, Team 2, Team 3
- A generic task pool
- 3 editable route stops

The seeded host secret is locked by default. Set a host PIN before using the hosted project or local development:

```sql
update private.host_secrets
set pin_hash = extensions.crypt('<new-pin>', extensions.gen_salt('bf'))
where game_id = '00000000-0000-4000-8000-000000000001';
```

After the host PIN is set, open `/host` and choose the game code players
should use. Opening an existing code returns to that room; opening a new code
creates a separate room cloned from the generic starter setup.

After pushing the migration, run advisors against the linked project:

```sh
supabase db advisors --linked --type security --fail-on error
supabase db advisors --linked --type performance --fail-on error
```

## Local Supabase

The local config enables anonymous sign-ins and seeds through the migration itself.

```sh
supabase start
supabase db reset
npm run dev
```

## Manual Checks

1. Join Team 1 in one browser and Team 2 in private/incognito.
2. Upload a proof photo and refresh; it should persist.
3. Open `/host`, claim host with the PIN, and confirm proof appears live.
4. Approve and retake from host view; the player board should update.
5. Replace a proof photo; the same task square should update, not duplicate.
6. Try approving as a non-host; it should fail.
7. Try reading another group's private proof as a player; it should fail.
8. Open `/host`, add at least two task-pool items, then click **Generate boards**.
9. Join two different groups and confirm their boards overlap but are not identical.
10. Submit one proof, return to `/host`, and confirm group-board assignment edits are locked while task wording remains editable.
