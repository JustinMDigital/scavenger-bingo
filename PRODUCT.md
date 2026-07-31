# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone can host a temporary game for friends, family, classmates, coworkers, or another invited group. Players can compete in teams or as individuals, including on shared devices. A primary host chooses the game structure and can add co-hosts, while players focus on completing only their own board.

## Product Purpose

Scavenger Bingo is a reusable, mobile-first game platform. Hosts can run team or free-for-all games, choose 3x3, 4x4, or 5x5 boards, use bingo or blackout winning rules, give everyone the same board or varied boards, and decide whether photo proof is required, optional, or disabled. Timing can be untimed, a simple countdown, or a multi-stop schedule.

New rooms open in setup instead of assuming a particular event. Presets cover a classic scheduled blackout, quick team bingo, and free-for-all play; custom setup exposes the same choices directly. Existing rooms are upgraded in place with their original teams, 5x5 blackout rules, proofs, and scheduled stops preserved.

The hosting flow is setup first, the join lobby last, and live hunt controls only after the host starts the game. Hosts should never be asked to gather players before the rules, teams, boards, and timing are ready.

Success means players can understand what to do immediately, complete tasks without fiddling with the interface, and keep track of time, progress, and proof submissions while staying engaged with the real-world activity.

Ease of use is the top product priority. New features should fit the existing player or host journey, keep the next action obvious, and avoid adding setup or explanation unless it is necessary to run the game.

## Positioning

Scavenger Bingo brings Kahoot-like ease to real-world scavenger games: a host can set up a game quickly, share a room code or link, and let invited players join without creating accounts. Unlike a fixed printable board, the room can coordinate teams, timing, live progress, optional proof photos, and host review while the activity is happening.

## Operating Context

Games happen in classrooms, parties, workplaces, city outings, family gatherings, and other group events. Hosts usually prepare the rules, teams, task pool, boards, timing, and proof requirements before inviting players. Players then use phones or shared devices while moving through the real-world activity; hosts may use a separate device or projector to manage the lobby, monitor progress, review proof, and close out the game.

Rooms are intentionally temporary. Joining should feel as lightweight as entering a familiar game code, and the interface must remain understandable in bright, distracting, time-sensitive environments.

## Capabilities and Constraints

The current product does not require player or host accounts. Accounts may be introduced later if they become necessary for durable ownership, saved templates, publishing, or moderation, but they are not part of the present-day joining or hosting promise.

## Game Template Library

Hosts can begin with a curated game kit that combines recommended rules, teams, timing, and a complete task pool. Applying a template copies it into the temporary room; the host can then change any setting or task without affecting the original template. The initial library covers a no-photo classroom starter, quick general play, individual play, birthday parties, city exploration, office team-building, and a no-photo indoor game for kids.

Blank games start with no selected tasks. The host chooses the board setup, searches a reviewed catalog of 250 all-ages tasks, adds room-local copies, and may edit or reset those copies before shuffling. Shared boards use one board's worth of tasks; varied boards can use a larger pool to reduce overlap naturally. Square-by-square placement remains available as an optional fine-tuning step after the shuffle.

Templates live in a public, searchable library rather than inside the room setup form. Each template has its own page where a host can understand the audience, setting, timing, rules, board size, and task list before starting. A host may create a new room directly from that page. During pre-game setup, the room links back to the same library so the host can safely replace the room setup after a clear warning.

Starting the hunt locks template replacement. An active or completed hunt can still open the library, but choosing another template must create a new room so existing players, progress, proofs, rules, and boards are never silently overwritten.

The built-in library is reviewed and intentionally small. A later phase may let account holders save, privately share, and publish their own templates. Public user submissions should only appear after review for safety, privacy, appropriateness, and task quality; submissions should not automatically publish into a public marketplace. The account, ownership, moderation, and publishing model remains an open product decision.

## Brand Commitments

The current working name is Scavenger Bingo, but a name change is expected. Future work should not treat the current name as a permanent identity asset.

The product should feel fun, simple, and energetic. The experience should be friendly enough for casual events, but still clear and reliable under time pressure. It should make the game feel active and social without becoming noisy or childish.

## Anti-references

This should not look like a corporate dashboard, a casino or gambling app, or a cluttered kids-only game UI. Avoid heavy gamification chrome, confusing badge systems, overdecorated cards, tiny status text, and visual patterns that make photo upload or task progress feel secondary.

## Evidence on Hand

- The working product and its host, player, template-library, privacy, support, and legal flows are implemented in this repository.
- The curated starter templates and task pools live in `src/gameKits.ts`.
- Product safety, privacy, operations, rehearsal, and release evidence lives in `PRIVACY.md`, `SECURITY.md`, `OPERATIONS.md`, `PILOT_REHEARSAL.md`, and `RELEASE_CHECKLIST.md`.
- Automated checks cover the client, room service, accessibility, proof handling, and export behavior.
- There are no confirmed testimonials, customer logos, usage benchmarks, press quotes, or permanent brand assets. Future product or marketing work must not invent them.

## Product Principles

1. Make setup and joining feel immediate: hosts should be able to prepare a game quickly, and players should enter with a code or link instead of an account.
2. Keep the next action obvious: hosts and players should not need extra explanation to understand the current step.
3. Protect group momentum: completing tasks, submitting proof, checking time, and reviewing progress should be fast enough to use while moving.
4. Let the real-world activity stay central: the product should coordinate the game without becoming the game.
5. Keep temporary rooms privacy-conscious by default, especially when photos, shared devices, schools, or younger participants are involved.

## Accessibility & Inclusion

Target WCAG AA. Completion states must be color-blind safe and should not rely on color alone. Motion should respect reduced-motion preferences. Text, tap targets, upload controls, timer states, and blackout-board cells should remain readable and usable for mixed-age event groups in bright, distracting, real-world settings.

## Public Operations

The public release is a temporary event-room service hosted as one Cloudflare
project. Website files, room logic, live updates, temporary data, and proof
photos deploy together. Rooms expire after seven days and are deliberately
bounded so the app can operate without a separate database or routinely
maintained server. The current Cloudflare account plan must be checked before
each release. Proof photos are not a permanent archive and the product should
say so wherever users might reasonably expect long-term storage.

Blank rooms and school-oriented templates start without photo uploads. Turning
photos on is a deliberate choice that requires participant approval plus any
additional approval that applies to the group. Players can leave and clear
shared-device data; hosts can delete one player's membership, submissions, and
proofs without deleting the whole room.

Presentation export is host-only by default. Before a hunt starts, the host may
authorize players to export only their same-team, current-board presentation
after the hunt reaches review and the board is revealed. The player must confirm
each export because the download or Google Drive presentation becomes a
separate copy that room deletion and expiry cannot recall. Full rosters,
cross-team data, and proof ZIP exports remain host-only.

Cloudflare Workers Static Assets and Durable Objects are the sole current public
runtime. There is no active Vercel path. Google Drive export is a browser-to-
Google action that begins only when the user chooses it; Google account
selection happens on every attempt and the app does not cache the access token.

## Flexible Game Rules

- Play: teams or individual free-for-all.
- Winning: one complete bingo line or a full-board blackout.
- Boards: 3x3, 4x4, or 5x5; shared or varied; optional center free space.
- Proof: required, optional, or none; host review or automatic approval.
- Timing: no timer, a duration countdown with pause/add-time controls, or scheduled stops.
- Lobby: open or closed; manual team choice or balanced automatic assignment.
- People: add, rename, recolor, reorder, and remove teams; move players or delete one player's room data; promote co-hosts and transfer primary-host ownership.
- Sharing: room code, direct player link, join QR code, and a projector-friendly join screen with a live player roster.
