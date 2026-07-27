# Operations and incident runbook

## Service boundaries

- One Cloudflare Worker serves static assets, the room API, and live updates.
- `GameRoom` stores one temporary room; `RoomRegistry` controls public creation.
- Rooms and server proof photos expire after seven days and have no backup.
- Deployment, custom-domain work, account changes, and production deletion are
  separate release actions and are not performed by local verification.

## Application limits

- 100 active confirmed rooms.
- A reservation lasts five minutes and becomes a seven-day registry entry only
  after room creation succeeds.
- 10 created rooms per browser per day and a separate 100-room shared-network
  safety ceiling. These controls do not treat a school IP as one teacher.
- 95 player memberships plus five reserved host/co-host seats, eight teams,
  100 tasks, and 20 scheduled stops per room.
- At most 50 new joins from one shared network per minute, with a clear retry
  response and a warning log when the ceiling is reached.
- Three live sockets per membership and 200 per room.
- At most 180 room-changing actions per membership per minute.
- 500 KB per proof after browser re-encoding, at most 8,192 pixels per side,
  at most 20 million decoded pixels, and 25 MB of proof bytes per room.
- JSON request bodies are limited to 64 KB.

Before production release, compare these application ceilings with the current
Cloudflare account plan and platform limits. Do not rely on old pricing or quota
numbers in a local document.

## Platform-limit comparison — checked July 26, 2026

Cloudflare's published
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and
[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
currently leave comfortable headroom around the application's own ceilings:

- Workers provide 128 MB of memory per isolate. The Worker streams proof
  uploads and stores proof bytes rather than keeping a room's 25 MB allowance
  in memory.
- The smallest published account request-body allowance is 100 MB. The app
  accepts at most 64 KB of JSON or 500 KB for one proof.
- A SQLite-backed Durable Object permits 10 GB per object and 2 MB for one
  key/value item. The app caps a room at 25 MB total proofs and one proof at
  500 KB.
- The WebSocket Hibernation API permits up to 32,768 connections per Durable
  Object. The app accepts at most 200 connections per room.
- The packaged Worker is 88.49 KiB compressed with nine static files, below
  the published Worker and asset ceilings.

This comparison does not confirm the production account's plan, daily request
allowance, billing protection, CPU behavior under class load, or enabled
observability. Confirm those in the Cloudflare account and record a real
classroom load test before broad distribution.

## Teacher pilot runbook

1. Use Classroom Starter unless the school has specifically approved photos.
2. Save the generated eight-digit host PIN outside the student-facing screen.
3. Complete rules, teams, boards, and timing before opening the lobby.
4. Share the generated room code only with the intended class.
5. Keep the lobby closed when students are not actively joining.
6. Use first names or nicknames and avoid full legal names.
7. At the end, delete individual student data on request, then reset proofs or
   abandon the room when no further review is needed.
8. Remind students on shared devices to use **Leave and clear this device**.

## Classroom incident response

### Room code shared outside the class

1. Close the lobby.
2. Capture only the time and room code needed for investigation; never copy a
   host PIN or student photo into a ticket.
3. Delete unexpected memberships and their data.
4. If exposure may continue, abandon the room and create a new generated code.

### Suspected host PIN guessing

1. Stop using the affected room and create a new generated room.
2. Do not reuse the PIN.
3. Review Cloudflare logs for claim failures and source distribution.
4. Preserve a narrow timestamped log excerpt without student content.

### Inappropriate or unintended photo

1. Use **Delete data** for the submitting student or reset all proofs.
2. Confirm the proof URL returns not found.
3. If a host exported a copy, remove that separate local/Google Drive copy under
   school policy; room deletion cannot recall exports.

### Service disruption

1. Check `/api/health`.
2. Check Cloudflare Worker errors, Durable Object errors, request volume,
   creation rejection rate, and storage usage.
3. Keep teachers informed through the pilot's existing contact channel.
4. If the current release caused the incident, roll back to the last verified
   deployment version. Do not attempt an untested emergency change in
   production.

## Monitoring before broad release

- Alert or review on elevated 5xx responses, room-creation 429s, PIN-claim 429s,
  proof 413/415 responses, and Durable Object alarm failures.
- Filter warning logs by the structured event names
  `active_room_limit`, `browser_room_creation_limit`,
  `network_room_creation_limit`, `host_pin_rate_limit`,
  `rapid_room_join_limit`, `membership_socket_limit`,
  `room_socket_limit`, `membership_mutation_limit`, and
  `room_proof_storage_limit`. These events do not include student names, photos,
  raw IP addresses, session cookies, or PINs.
- Check active room count and proof-storage growth.
- Run a scheduled synthetic flow: health, create room, join, start, complete,
  targeted delete, and abandon.
- Confirm the public privacy/support pages and contact channel from an
  unauthenticated browser.

## Release record and rollback

Before each production release:

1. Run the complete release checklist and record the commit identifier.
2. Use `npx wrangler deployments list` or the Cloudflare dashboard to record
   the currently active, last-known-good Worker version in
   `PILOT_REHEARSAL.md`.
3. Deploy only with an explicitly approved release owner.
4. Complete the live health and classroom smoke checks before declaring the
   new version good.

If the new version causes an incident, select the recorded version in
Cloudflare's deployment history or run
`npx wrangler rollback <LAST_KNOWN_GOOD_VERSION>`. A rollback immediately
becomes the active deployment, but it does not roll back Durable Object data.
Do not use a version whose bindings or Durable Object class migrations are
incompatible with the current resources.

## Ownership gates

Broad self-service school release requires named owners for:

- Public support and privacy requests, with a monitored address and response
  expectation.
- Cloudflare account, billing/plan limits, logs, and incident access.
- Deployment approval and rollback.
- School/privacy review and updates to the public notice.
