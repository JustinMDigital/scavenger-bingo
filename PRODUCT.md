# Product

## Register

product

## Users

Event players can compete in teams or as individuals. They may be moving between locations, playing in one venue, checking a shared game state quickly, or coordinating while time is limited. A primary host chooses the game structure and can add co-hosts, while players focus on completing their own board.

## Product Purpose

Scavenger Blackout is a reusable, mobile-first game platform. Hosts can run team or free-for-all games, choose 3x3, 4x4, or 5x5 boards, use bingo or blackout winning rules, give everyone the same board or varied boards, and decide whether photo proof is required, optional, or disabled. Timing can be untimed, a simple countdown, or a multi-stop schedule.

New rooms open in setup instead of assuming a particular event. Presets cover a classic scheduled blackout, quick team bingo, and free-for-all play; custom setup exposes the same choices directly. Existing rooms are upgraded in place with their original teams, 5x5 blackout rules, proofs, and scheduled stops preserved.

Success means players can understand what to do immediately, complete tasks without fiddling with the interface, and keep track of time, progress, and proof submissions while staying engaged with the real-world activity.

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
- Sharing: room code, direct player link, and join QR code.
