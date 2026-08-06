# Cloudflare Release Setup

The public app now ships as one Cloudflare project. The website, room API, live
updates, temporary room data, and proof photos deploy together. It does not need
Supabase, Vercel, a separate database, or another server to maintain.
Cloudflare Workers Static Assets and Durable Objects are the sole current
runtime.

Cloudflare now recommends Workers with Static Assets for new full-stack projects.
It provides the Pages-style website hosting requested here while allowing each
live room to use a Durable Object for coordinated state and live updates.

## One-time release

1. Create or sign in to a free Cloudflare account.
2. From this folder, sign in once:

   ```sh
   npx wrangler login
   ```

3. Remove the old `.env.local` file if it only contains Supabase settings. It is
   ignored by Git and no longer used by the app.
4. Set `VITE_SUPPORT_EMAIL` to the monitored public support/privacy address,
   either in the deployment environment or an ignored
   `.env.production.local` file.
5. In an owned Google Cloud project, enable the Drive API and configure the
   OAuth consent screen and web client. Add the exact local and production
   origins and the deployed privacy/support links, then set the public web
   client identifier as `VITE_GOOGLE_CLIENT_ID`. Never put a client secret in
   the browser environment.
6. If Cloudflare Workers Builds is connected to GitHub, configure it to build
   with `npm run build:release` and deploy with
   `npx wrangler versions upload`. Store the public support address and Google
   client ID as build variables. This keeps automatic builds available as
   preview versions without promoting an unchecked commit to production.
   Production promotion must use the controlled command in step 8.
7. From the exact intended release commit and a clean worktree, run the
   non-deploying release preflight:

   ```sh
   npm ci
   npm run release:preflight
   ```

   It runs a full-lockfile dependency audit, tests, a production build,
   release-metadata validation, desktop and phone multi-user browser journeys,
   and a Wrangler packaging dry run. It refuses a dirty worktree or
   missing/invalid support and Google settings. The `--allow-dirty` option is for
   local diagnosis only.
8. After the checklist and release owner explicitly approve production, copy
   the exact 32-character account identifier from the approved Cloudflare
   account, set it together with the final verification URL, and publish:

   ```sh
   export CLOUDFLARE_ACCOUNT_ID=YOUR_32_CHARACTER_ACCOUNT_ID
   export RELEASE_VERIFY_URL=https://YOUR-DOMAIN
   npm run deploy
   ```

   The deploy command refuses Wrangler's implicit cached-account selection,
   repeats the clean preflight, rejects source or public-configuration drift,
   deploys the exact verified build, then tags it with the generated release
   identifier.
9. Configure and verify the custom domain and TLS from the project's
   **Settings > Domains & Routes** page.
10. Check the deployed identity and public pages without changing room data:

   ```sh
   npm run verify:deployment -- https://YOUR-DOMAIN
   ```

   Then perform the separately approved live room smoke test and record the
   deployment identifier and rollback target.

Wrangler creates the Worker and both room-storage namespaces on the first
deployment. Google Cloud/OAuth/Drive, Cloudflare account ownership and
production deployment, domain/TLS, and live device/school validation are
external actions; this repository does not complete them automatically.

## How the free public version stays bounded

- Rooms last seven days, then their game data and proof photos are deleted.
- Abandoning a room deletes it immediately.
- At most 100 confirmed rooms can be active at once.
- Creation first uses a five-minute reservation. Failed setup does not consume a
  seven-day room slot.
- A browser can create at most 10 rooms per day. A separate 100-room
  shared-network safety ceiling prevents one school IP from representing one
  teacher.
- A room can have at most eight teams, 95 players, and five reserved
  host/co-host seats.
- Proof photos are re-encoded in the browser to remove metadata, capped at
  500 KB each, validated as JPG/PNG/WebP, bounded by image dimensions, and
  capped at 25 MB total per room.
- Proofs are private to their team or individual board and the host.
- New host access uses a generated eight-digit PIN stored only as a salted
  one-way hash. Existing legacy rooms may still reopen with a four-character
  PIN. Failed-claim limits persist across Worker restarts.
- Students receive only their own team roster, and hidden boards do not return
  tasks before the host reveals them.
- JSON and proof request bodies have application-level streaming limits.
- Live updates use sleeping WebSocket connections so idle rooms do not keep a
  server running, with per-student and per-room connection caps.

Before every release, compare these application limits with the current
Cloudflare account plan and platform limits. Cloudflare quotas and pricing can
change; do not treat old numbers in a release note as current evidence.

Current pricing references:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## What is intentionally temporary

This is an event-room service, not permanent photo storage. There are no backups
and expired or abandoned rooms cannot be restored. Presentation export is
host-only by default. A host may authorize a player before the hunt to export
only the same team's current board after review and board reveal; the player
must confirm each separate copy. Full rosters, cross-team data, and proof ZIPs
remain host-only.

Google code loads only when the user chooses Google export. Account selection is
requested on every attempt and the short-lived token is not cached. Any
downloaded or Google Drive copy is outside room expiry, cannot be recalled by
the service, and must be handled under the host organization's policy.

## Routine ownership

There is no database to pause, migration service to operate, or storage bucket to
clean manually. Cloudflare handles the runtime and automatically wakes a room
when it receives traffic. Expected maintenance includes publishing app updates,
checking logs and creation rejections, and monitoring Durable Object errors and
storage/capacity as documented in `OPERATIONS.md`.

Every production build emits `/release.json` with its version, commit, source
timestamp, public-configuration fingerprint, release identifier, and
dirty-source flag. The fingerprint covers the public support address and Google
OAuth client ID without exposing either raw value, and is included in the
Cloudflare deployment tag. Record that identity, the CI run, the Cloudflare
deployment identifier, the verification time, and the last-known-good rollback
target for every release.
