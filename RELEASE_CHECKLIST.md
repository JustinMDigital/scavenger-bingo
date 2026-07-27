# Teacher and student release checklist

Every required item needs current evidence. A local green build is not a
production release verdict.

## Current decision — July 26, 2026

The local product is ready for a supervised teacher/student pilot once a pilot
owner completes these non-code gates:

1. Confirm a monitored support/privacy contact.
2. Obtain the participating school or teacher's approval for nicknames,
   optional photos, deletion, and exports.
3. Run one real Chromebook/shared-device/classroom-network rehearsal.
4. Confirm the Cloudflare account plan, logs, and rollback owner.

Broad self-service school distribution is not yet approved. It additionally
requires the incident rehearsal and live post-deployment checks below.

## Code and local runtime

- [x] `npm run check` passes from the intended release worktree.
- [x] `npm audit` reports no known dependency vulnerabilities.
- [x] Wrangler dry-run packaging succeeds.
- [x] Two independent local browser origins complete create, configure, join, start, task completion,
  review, one-student deletion, leave/clear, and room abandonment.
- [x] Hidden players cannot read tasks before reveal or unrelated roster names.
- [x] Spoofed, oversized, and extreme-dimension proof images are rejected.
- [ ] Keyboard-only use, visible focus, 200% zoom/reflow, reduced motion, and
  assistive-technology checks pass on supported real devices.
- [x] Automated labels/headings checks and desktop, phone-size, and
  200%-equivalent local reflow checks pass.
- [x] Real Chromium at phone size verifies readable landing/footer contrast,
  no horizontal overflow, a visible keyboard skip link, correct focus transfer,
  configured support contact, and reduced-motion styles.
- [x] Automated shared-device storage checks keep two students' queued photos
  separate and remove only the intended student's queue.
- [x] A local shared-network simulation supports three teachers and a
  30-student class from one network address.
- [ ] At least one real school Chromebook/network pilot is recorded separately.

## Privacy and classroom safety

- [x] Classroom Starter and blank rooms default to no photos.
- [x] Enabling photos requires the approval acknowledgment.
- [x] Public `/privacy` and `/support` pages match the locally verified behavior.
- [x] A configured monitored address appears on both pages, and deployment
  stops before publishing when the address is missing or invalid.
- [ ] A monitored public support/privacy contact and response owner are
  confirmed and added to the pages.
- [ ] The school/district pilot owner approves the activity, student notice,
  nickname guidance, photo policy, and deletion process.
- [ ] A real shared-device test confirms queued photos and nicknames do not
  cross between students.
- [ ] Host exports and separately retained copies are covered by school policy.

## Capacity and operations

- [ ] Cloudflare account plan and current Worker/Durable Object limits support
  the expected rooms, requests, sockets, CPU, and 25 MB room proof cap.
- [ ] A real school NAT test allows a full class and multiple teachers without
  sharing the per-browser creation limit.
- [ ] Logs/observability are available to the incident owner.
- [x] Privacy-safe warning events identify creation, PIN, join, socket,
  mutation, and proof-capacity incidents without student data or credentials.
- [x] An automated local incident rehearsal verifies health, lobby closure,
  targeted photo deletion, and room shutdown.
- [x] A real-browser room-abandonment rehearsal returns cleanly to host setup
  without a stale room error or console warning.
- [ ] The production incident owner has rehearsed a leaked code, unintended
  photo, deletion request, and service failure.
- [x] The rollback procedure and a safe rehearsal record are documented.
- [ ] The last known-good deployed version is recorded.

## External release gates

- [ ] Cloudflare production deployment is explicitly approved.
- [ ] Production environment and Durable Object migrations are verified.
- [ ] Custom domain and TLS are configured and verified.
- [ ] Live health, create/join, deletion, privacy/support, and 404 behavior pass.
- [ ] The release owner records the deployment version and verification time.

Pilot distribution can begin only when the pilot's applicable rows are checked.
Broad self-service distribution requires every row.
