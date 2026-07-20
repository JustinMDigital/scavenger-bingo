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
4. Verify the complete local release:

   ```sh
   npm run check
   ```

5. Publish the website and backend:

   ```sh
   npm run deploy
   ```

Wrangler creates the Worker and both room-storage namespaces on the first
deployment. Later releases use the same command. A custom domain can be added
from the project's **Settings > Domains & Routes** page, but is optional.

## How the free public version stays bounded

- Rooms last seven days, then their game data and proof photos are deleted.
- Abandoning a room deletes it immediately.
- At most 40 rooms can be active at once.
- One internet connection can create at most two rooms per day.
- A room can have at most eight teams.
- Proof photos are compressed in the browser and capped at 500 KB.
- Proofs are private to their team and the host.
- Host access uses a 4-32 character PIN stored only as a one-way hash.
- Live updates use sleeping WebSocket connections so idle rooms do not keep a
  server running.

At the configured maximum, proof storage remains below the free account's 5 GB
Durable Object storage ceiling. Cloudflare's current free allowance is 100,000
Worker requests and 100,000 Durable Object requests per day; exceeding a free
limit makes additional operations fail instead of creating usage charges.

Current pricing references:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## What is intentionally temporary

This is an event-room service, not permanent photo storage. There are no backups
and expired or abandoned rooms cannot be restored. Players should save any proof
photos they want to keep before the room expires.

## Routine ownership

There is no database to pause, migration service to operate, or storage bucket to
clean manually. Cloudflare handles the runtime and automatically wakes a room
when it receives traffic. The only expected maintenance is publishing app updates
and occasionally checking the free-usage dashboard if public traffic grows.

