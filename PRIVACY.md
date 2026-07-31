# Privacy inventory

This file records what the current product does. It is not legal advice or a
substitute for a person or organization reviewing their own obligations.

## Data collected

- First name or nickname, not a required full legal name.
- Temporary room, role, team, board, task progress, and proof-review state.
- An opaque HttpOnly, SameSite session cookie retained for up to seven days.
- Optional proof photos only when a host deliberately enables photo uploads.
- The normalized proof filename, image type, byte size, and submission time.
- One-way browser and network identifiers used only for creation and PIN-abuse
  limits. The application does not store the original IP address in room data.
- A failed proof photo may be held in that browser's IndexedDB for retry. It is
  scoped to the player membership and expires after seven days.
- When a host or authorized player chooses Google Slides export, a short-lived
  Google access token is held only in browser memory while that presentation is
  created. Account selection is requested on every attempt.

## Data not collected by this repository

- Permanent player accounts, passwords, email addresses, phone numbers, or
  home addresses.
- Advertising identifiers, behavioral analytics, cross-site tracking, or sale
  of personal information.
- Precise device location. Client photos are re-encoded before upload to remove
  EXIF metadata such as GPS and device details.
- Google access tokens in browser storage, room data, logs, or the service's
  server.
- Cached Google access tokens between export attempts. The Google library is not
  loaded until the user chooses the Google export action.

## Processors and transfers

- Cloudflare Workers Static Assets and Durable Objects are the sole current
  application runtime. Cloudflare serves the application and stores temporary
  room data and proof bytes. There is no active Vercel runtime.
- Presentation export is host-only by default. Before the hunt starts, a host
  may authorize player exports. That authorization is limited to the player's
  same-team, current-board presentation and becomes available only after review
  and board reveal. It does not grant access to the full roster, another team's
  data, or a proof ZIP; those remain host-only.
- Before each player presentation export, the player confirms that a separate
  copy will be created. A Google export then loads Google's library, asks the
  user to select an account, requests the narrow `drive.file` permission, and
  uploads the new presentation directly from the browser. The presentation may
  include the game and team names, current team members, current-board progress
  and prompts, proof photos, and photographer/submitter credits. The app does
  not list or read the user's other Drive files.
- The exported presentation is a separate copy governed by the exporting
  person's Google account and any policies that apply to it. A downloaded
  presentation is governed by the device and organization that keeps it. Either
  copy remains until its owner or Google Workspace administrator deletes it;
  disabling export, leaving, deleting the room, or room expiry cannot recall it.
- Google user data is used only to provide the user-requested export. It is
  not sold, used for advertising or profiling, or transferred for unrelated
  purposes. This use follows the Google API Services User Data Policy,
  including its Limited Use requirements.
- No other third-party data transfer is implemented in the active Cloudflare
  application.

## Retention and deletion

- Server room state and proof bytes expire automatically within seven days.
- Abandoning a room deletes all room data immediately.
- Resetting proofs deletes all submission records and proof bytes.
- The host's **Delete data** action deletes one player's membership,
  submission records, proof bytes, and individual board.
- **Leave and clear this device** performs the same server deletion for the
  player and clears the player's local nickname and queued proof photos.
- Browser retry rows expire after seven days and legacy rows without a
  membership owner are purged.
- There is no backup or recovery of expired, abandoned, reset, or individually
  deleted room data.
- Separate presentation and proof ZIP copies are not room data. Hosts and
  authorized players must delete those copies separately under the policy that
  applies to their group.

## Photo-safe defaults

- A blank room starts with photo uploads disabled.
- The Classroom Starter and Kids' Indoor templates disable photo uploads and
  avoid face-photo prompts.
- Enabling optional or required photos requires the host to acknowledge
  participant approval and any additional approval that applies to the group,
  and to avoid faces, private documents, and exact locations unless
  specifically approved.

## Request handling

Players should send access or deletion requests to the host who supplied the
room code. The host can act immediately inside the room. A monitored public
privacy contact must be confirmed before broad self-service release. School or
organization approval is still required for nicknames, optional photos,
deletion, and any separately retained export. Google Cloud/OAuth/Drive setup,
the custom domain/TLS, production account ownership and deployment, and real
shared-device/school-network validation are external release gates.
