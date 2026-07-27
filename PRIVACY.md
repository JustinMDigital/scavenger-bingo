# Privacy inventory

This file records what the current product does. It is not legal advice or a
substitute for a school or organization reviewing its own obligations.

## Data collected

- First name or nickname, not a required full legal name.
- Temporary room, role, team, board, task progress, and proof-review state.
- An opaque HttpOnly, SameSite session cookie retained for up to seven days.
- Optional proof photos only when a host deliberately enables photo uploads.
- The normalized proof filename, image type, byte size, and submission time.
- One-way browser and network identifiers used only for creation and PIN-abuse
  limits. The application does not store the original IP address in room data.
- A failed proof photo may be held in that browser's IndexedDB for retry. It is
  scoped to the student membership and expires after seven days.
- When a player chooses Google Slides export, a short-lived Google access token
  is held only in browser memory while the presentation is created.

## Data not collected by this repository

- Permanent student accounts, passwords, email addresses, phone numbers, or
  home addresses.
- Advertising identifiers, behavioral analytics, cross-site tracking, or sale
  of personal information.
- Precise device location. Client photos are re-encoded before upload to remove
  EXIF metadata such as GPS and device details.
- Google access tokens in browser storage, room data, logs, or the service's
  server.

## Processors and transfers

- Cloudflare serves the application and stores temporary Durable Object room
  data and proof bytes.
- A player may explicitly export a finished board to Google Drive. The browser
  requests the narrow `drive.file` permission and uploads a new presentation
  containing the game and team names, current team members, progress, prompts,
  proof photos, and submitter attribution. The app does not list or read the
  player's other Drive files.
- The exported presentation is a separate copy governed by the player's Google
  account and school or organization policy. It remains in Drive until the
  player or Google Workspace administrator deletes it.
- Google user data is used only to provide the player-requested export. It is
  not sold, used for advertising or profiling, or transferred for unrelated
  purposes. This use follows the Google API Services User Data Policy,
  including its Limited Use requirements.
- No other third-party data transfer is implemented in the active Cloudflare
  application.

## Retention and deletion

- Server room state and proof bytes expire automatically within seven days.
- Abandoning a room deletes all room data immediately.
- Resetting proofs deletes all submission records and proof bytes.
- The teacher's **Delete data** action deletes one student's membership,
  submission records, proof bytes, and individual board.
- **Leave and clear this device** performs the same server deletion for the
  student and clears the student's local nickname and queued proof photos.
- Browser retry rows expire after seven days and legacy rows without a
  membership owner are purged.
- There is no backup or recovery of expired, abandoned, reset, or individually
  deleted room data.

## Classroom defaults

- A blank room starts with photo uploads disabled.
- The Classroom Starter and Kids' Indoor templates disable photo uploads and
  avoid face-photo prompts.
- Enabling optional or required photos requires the host to acknowledge school
  or participant approval and avoid faces, private documents, and exact
  locations unless specifically approved.

## Request handling

Students or families should send access or deletion requests to the teacher or
school that supplied the room code. The teacher can act immediately inside the
room. A monitored public privacy contact must be confirmed before broad
self-service school release.
