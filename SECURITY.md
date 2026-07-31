# Security

## Reporting a concern

During a pilot, report security or privacy concerns through the same private
channel that supplied the Scavenger Blackout link. Include:

- The room code and approximate time.
- Device, browser, and the action that was attempted.
- Whether the reporter was a host or player.
- A description of the unexpected result.

Do not include a host PIN, session cookie, full player name, or private photo.

A monitored public security contact and response owner must be confirmed before
broad self-service release. Until then, the app is suitable only for
coordinated pilots with an established contact channel.

## Supported release

Only the current deployed version is supported. Rooms are temporary, expire
after seven days, and are not recoverable. Security fixes should be deployed
only after the full release checklist passes and a rollback version is ready.

Cloudflare Workers Static Assets and Durable Objects are the sole current
runtime. There is no active Vercel release path. A player session receives only
the room state needed for that player and team; host-only actions are enforced
by the Worker rather than by hidden interface controls.

## Export boundary

Presentation export is host-only by default. A host may authorize player
presentation export before a hunt starts, but the player can export only the
same team's current board after review and board reveal. Each player export
requires a separate-copy confirmation. Full rosters, cross-team content, and
proof ZIPs remain host-only.

Google code is loaded only when the user chooses Google export. The browser asks
the user to select an account on every attempt and keeps the short-lived token
only in memory for that attempt; it does not cache the token or send it to the
Worker. Downloaded and Google Drive copies are outside room retention and cannot
be recalled by disabling export, deleting data, or waiting for room expiry.

## Release identity

The production build emits `/release.json` with the application version, source
revision, source timestamp, public-configuration fingerprint, release identifier,
and dirty-source flag. The SHA-256 fingerprint covers the public support address
and Google OAuth client ID without publishing their raw values in the manifest.
It is part of the release identifier and Cloudflare deployment tag, so different
public configuration cannot share an identity for the same commit. CI repeats
the full-lockfile dependency audit, tests, build, metadata, and multi-user browser
checks. The release preflight also performs a Cloudflare packaging dry run
without deploying, and the read-only deployment verifier compares a live release
and Cloudflare tag with the expected identity.

Static responses set a restrictive Content Security Policy, deny framing, avoid
content-type sniffing and referrer disclosure, and limit unused browser features.
The policy keeps only the Google Identity and Drive connections required for the
deliberate export action. The opener policy uses `same-origin-allow-popups` so
Google account selection continues to work.

These controls do not approve a deployment. Google Cloud/OAuth/Drive setup,
Cloudflare account ownership and plan checks, custom domain/TLS, production
deployment and rollback ownership, and physical-device, screen-reader,
Chromebook, shared-device, school-network, and school-approval evidence remain
external gates.
