# Cloudflare Release Setup

The public app now ships as one Cloudflare project. The website, room API, live
updates, temporary room data, and proof photos deploy together. It does not need
Supabase, a separate database, browser environment variables, or a server to
maintain.

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
   `.env.production.local` file. The deploy command refuses to publish without
   a valid address.
5. Verify the complete local release:

   ```sh
   npm run check
   ```

6. Publish the website and backend:

   ```sh
   npm run deploy
   ```

Wrangler creates the Worker and both room-storage namespaces on the first
deployment. Later releases use the same command. A custom domain can be added
from the project's **Settings > Domains & Routes** page, but is optional.

## How the free public version stays bounded

- Rooms last seven days, then their game data and proof photos are deleted.
- Abandoning a room deletes it immediately.
- At most 100 confirmed rooms can be active at once.
- Creation first uses a five-minute reservation. Failed setup does not consume a
  seven-day room slot.
- A browser can create at most 10 rooms per day. A separate 100-room
  shared-network safety ceiling prevents one school IP from representing one
  teacher.
- A room can have at most eight teams or 100 individual participants.
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
and expired or abandoned rooms cannot be restored. Only hosts can export review
copies. Any exported local or Google Drive copy is outside room expiry and must
be handled under the host organization's policy.

## Routine ownership

There is no database to pause, migration service to operate, or storage bucket to
clean manually. Cloudflare handles the runtime and automatically wakes a room
when it receives traffic. Expected maintenance includes publishing app updates,
checking logs and creation rejections, and monitoring Durable Object errors and
storage/capacity as documented in `OPERATIONS.md`.
