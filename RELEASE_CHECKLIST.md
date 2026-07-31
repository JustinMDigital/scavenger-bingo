# Teacher and student release checklist

Every required item needs current evidence. A local green build is not a
production release verdict.

## Current decision — July 27, 2026

The repository contains the local public-beta safeguards and a repeatable
release process, but this checklist does not mark the current revision as
released. The July 26 evidence remains recorded in
`SECURITY_AUDIT_2026-07-26.md`; changed code needs fresh evidence tied to its
exact commit and release identifier.

No production deployment, Cloudflare/Google account mutation, DNS change, or
external approval is implied by local verification.

## Intended revision and automated evidence

- [ ] The intended source commit, package version, and clean worktree are
  recorded.
- [ ] CI passes `npm ci`, automated tests, the production build, build-identity
  validation, and the desktop/phone multi-user browser journeys for that commit.
- [ ] `npm run release:preflight` passes from the same clean revision with the
  monitored support address and approved Google OAuth client configured.
- [ ] The preflight's Cloudflare packaging dry run succeeds; no deploy occurs.
- [ ] The generated `release.json` records the expected version, full commit,
  source timestamp, public-configuration fingerprint, release identifier, and
  `dirty: false`; the Cloudflare deployment tag matches that exact identifier.
- [ ] A fresh full-lockfile dependency audit using current registry data is
  recorded, including runtime, build, test, and deployment tooling.
- [ ] Browser evidence covers independent host and player sessions, live
  updates, task completion, review, targeted deletion, leave/clear, and room
  abandonment without browser errors.
- [ ] Hidden players cannot read tasks, other board assignments, or unrelated
  roster names before reveal.
- [ ] Spoofed, oversized, and extreme-dimension proof images are rejected.
- [ ] Shared-device retry storage keeps memberships separate and removes only
  the intended player's queue.
- [ ] A local shared-network simulation supports the planned rooms and players
  without treating one network address as one teacher.
- [ ] Keyboard-only use, visible focus, 200% zoom/reflow, reduced motion, and
  assistive-technology checks pass on supported real devices.
- [ ] At least one real school Chromebook/network pilot is recorded separately.

## Privacy, export, and group safety

- [ ] Classroom Starter and blank rooms default to no photos.
- [ ] Enabling photos requires the host's participant/organization approval
  acknowledgment.
- [ ] Player presentation export is host-only by default.
- [ ] A host may authorize it only before the hunt starts.
- [ ] An authorized player can export only the same team's current board after
  review and board reveal, with confirmation on every export.
- [ ] Full rosters, cross-team data, and proof ZIPs remain host-only.
- [ ] Google code loads only on the user's export click, account selection is
  requested every time, and the app does not cache or server-store the token.
- [ ] The interface and notices explain that downloaded and Drive copies cannot
  be recalled by disabling export, leaving, deletion, abandonment, or expiry.
- [ ] Public `/privacy`, `/terms`, and `/support` pages match the verified
  behavior and display a monitored contact.
- [ ] A monitored public support/privacy contact and response owner are
  confirmed.
- [ ] The organization or school approves the activity, notice, nickname
  guidance, photo policy, deletion process, and separately retained exports.
- [ ] A real shared-device test confirms queued photos and nicknames do not
  cross between students.

## Capacity and operations

- [ ] Cloudflare account plan and current Worker/Durable Object limits support
  the expected rooms, requests, sockets, CPU, and 25 MB room proof cap.
- [ ] A real school NAT test allows a full class and multiple teachers without
  sharing the per-browser creation limit.
- [ ] Logs/observability are available to the incident owner.
- [ ] Privacy-safe warning events identify creation, PIN, join, socket,
  mutation, and proof-capacity incidents without student data or credentials.
- [ ] An automated local incident rehearsal verifies health, lobby closure,
  targeted photo deletion, and room shutdown.
- [ ] A real-browser room-abandonment rehearsal returns cleanly to host setup
  without a stale room error or console warning.
- [ ] The production incident owner has rehearsed a leaked code, unintended
  photo, deletion request, and service failure.
- [ ] The rollback owner and procedure are confirmed.
- [ ] The last known-good deployed version is recorded.

## External release gates

- [ ] Google Cloud project ownership, Drive API, OAuth consent/client, approved
  origins, and the required privacy/support links are configured and verified.
- [ ] Cloudflare production account ownership, plan, logs, alerts, and rollback
  access are confirmed, and its exact 32-character account identifier is set as
  `CLOUDFLARE_ACCOUNT_ID` for the release command.
- [ ] Cloudflare production deployment is explicitly approved.
- [ ] Production environment and Durable Object migrations are verified.
- [ ] Custom domain and TLS are configured and verified.
- [ ] Physical phone/tablet, shared Chromebook, keyboard, screen-reader, school
  network/NAT, and organization-approval rehearsals are recorded.
- [ ] `npm run verify:deployment -- https://YOUR-DOMAIN` confirms the expected
  live build identity, public-configuration fingerprint, Cloudflare deployment
  tag, security headers, and public pages without mutating room data.
- [ ] Separately approved live create/join, deletion, export-policy, expiry, and
  abandonment checks pass.
- [ ] The release owner records the deployment identifier, version, release
  identifier, source commit, CI run, verification time, and rollback target.

Pilot distribution can begin only when the pilot's applicable rows are checked.
Broad self-service distribution requires every row.
