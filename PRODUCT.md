# Product

## Register

product

## Users

Event players can compete in teams or as individuals. They may be moving between locations, playing in one venue, checking a shared game state quickly, or coordinating while time is limited. A primary host chooses the game structure and can add co-hosts, while players focus on completing their own board.

## Product Purpose

Scavenger Blackout is a reusable, mobile-first game platform. Hosts can run team or free-for-all games, choose 3x3, 4x4, or 5x5 boards, use bingo or blackout winning rules, give everyone the same board or varied boards, and decide whether photo proof is required, optional, or disabled. Timing can be untimed, a simple countdown, or a multi-stop schedule.

New rooms open in setup instead of assuming a particular event. Presets cover a classic scheduled blackout, quick team bingo, and free-for-all play; custom setup exposes the same choices directly. Existing rooms are upgraded in place with their original teams, 5x5 blackout rules, proofs, and scheduled stops preserved.

The hosting flow is setup first, the join lobby last, and live hunt controls only after the host starts the game. Hosts should never be asked to gather players before the rules, teams, boards, and timing are ready.

Success means players can understand what to do immediately, complete tasks without fiddling with the interface, and keep track of time, progress, and proof submissions while staying engaged with the real-world activity.

Ease of use is the top product priority. New features should fit the existing player or host journey, keep the next action obvious, and avoid adding setup or explanation unless it is necessary to run the game.

## Game Template Library

Hosts can begin with a curated game kit that combines recommended rules, teams, timing, and a complete task pool. Applying a template copies it into the temporary room; the host can then change any setting or task without affecting the original template. The initial library covers quick general play, individual play, birthday parties, city exploration, office team-building, and indoor games for kids.

Templates live in a public, searchable library rather than inside the room setup form. Each template has its own page where a host can understand the audience, setting, timing, rules, board size, and task list before starting. A host may create a new room directly from that page. During pre-game setup, the room links back to the same library so the host can safely replace the room setup after a clear warning.

Starting the hunt locks template replacement. An active or completed hunt can still open the library, but choosing another template must create a new room so existing players, progress, proofs, rules, and boards are never silently overwritten.

The built-in library is reviewed and intentionally small. A later phase may let hosts save and privately share their own templates. Public user submissions should only appear after review for safety, privacy, appropriateness, and task quality; submissions should not automatically publish into a public marketplace.

## Brand Personality

Fun, simple, and energetic. The interface should feel friendly enough for casual events, but still clear and reliable under time pressure. It should make the game feel active and social without becoming noisy or childish.

## Anti-references

This should not look like a corporate dashboard, a casino or gambling app, or a cluttered kids-only game UI. Avoid heavy gamification chrome, confusing badge systems, overdecorated cards, tiny status text, and visual patterns that make photo upload or task progress feel secondary.

## Design Principles

1. Keep the task card obvious: players should always know what to tap next, what is already submitted, and what still needs proof.
2. Prioritize group momentum: photo upload, completion state, and timer visibility should be fast enough to use while moving around.
3. Make progress visible at a glance: bingo or blackout status, completed tasks, and the selected timing model should not require interpretation.
4. Design for mixed ages: controls need to be large, familiar, and forgiving, with minimal helper text.
5. Let the real-world game stay central: the UI should support the scavenger hunt, not compete with it.

## Accessibility & Inclusion

Target WCAG AA. Completion states must be color-blind safe and should not rely on color alone. Motion should respect reduced-motion preferences. Text, tap targets, upload controls, timer states, and blackout-board cells should remain readable and usable for mixed-age event groups in bright, distracting, real-world settings.

## Public Operations

The public release is a temporary event-room service hosted as one Cloudflare
project. Website files, room logic, live updates, temporary data, and proof
photos deploy together. Rooms expire after seven days and are deliberately
bounded so the app can operate inside Cloudflare's free plan without a separate
database or routinely maintained server. Proof photos are not a permanent
archive and the product should say so wherever users might reasonably expect
long-term storage.

## Flexible Game Rules

- Play: teams or individual free-for-all.
- Winning: one complete bingo line or a full-board blackout.
- Boards: 3x3, 4x4, or 5x5; shared or varied; optional center free space.
- Proof: required, optional, or none; host review or automatic approval.
- Timing: no timer, a duration countdown with pause/add-time controls, or scheduled stops.
- Lobby: open or closed; manual team choice or balanced automatic assignment.
- People: add, rename, recolor, reorder, and remove teams; move or kick players; promote co-hosts and transfer primary-host ownership.
- Sharing: room code, direct player link, join QR code, and a projector-friendly join screen with a live player roster.
