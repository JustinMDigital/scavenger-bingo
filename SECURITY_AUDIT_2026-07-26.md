# Security readiness audit — July 26, 2026

This record compares the repository-wide security scan with the locally
verified worktree after remediation. The sealed pre-fix scan covered the
deployed React and Cloudflare Worker paths and reported 20 findings: one high,
six medium, and thirteen low.

## Remediation result

| # | Original risk | Current local status |
| --- | --- | --- |
| 1 | Public room reservations could exhaust the global pool | Remediated: five-minute unconfirmed reservations, confirmation after successful creation, failure release, 100 confirmed-room ceiling, and separate browser/network creation limits. |
| 2 | Players could permanently export teammate data | Remediated: presentation and proof exports are host-only. |
| 3 | Classroom and blank rooms collected photos by default | Remediated: both default to no photos; enabling photos requires an explicit school-approval acknowledgment. |
| 4 | Players received the full student roster | Remediated: hosts receive the full roster; players receive only their own team; anonymous clients receive none. |
| 5 | One school network shared a two-room quota | Remediated: creation uses a browser limit with a separate 100-room shared-network ceiling. |
| 6 | Removing a student retained submissions and photos | Remediated: host deletion and student leave remove membership-linked submissions, proof bytes, individual assignments, saved identity, and queued local proofs. |
| 7 | Repeated fresh sessions could fill a room | Mitigated: 95 player seats preserve five host seats, one network can add at most 50 new players per minute, and the limit produces a warning log. A distributed room-code attack remains possible and should be covered by monitoring. |
| 8 | Memberships could open unlimited sockets and writes | Remediated at the application layer: three sockets per membership, 200 per room, and 180 room-changing actions per membership per minute. Platform limits still need production-account verification. |
| 9 | Proof ZIP export could retain too many images in memory | Mitigated: proof storage is capped at 25 MB per room. Constrained real-device export testing is still required. |
| 10 | Exported proof extensions trusted player filenames | Remediated: the Worker validates bytes and normalizes the stored filename and MIME; exports derive the extension from validated MIME. |
| 11 | Nickname/team persisted across shared-device students | Remediated: leave/clear and remote host deletion clear the saved identity; stale identity is cleared when the server no longer recognizes the membership. |
| 12 | Concurrent image decoding could exhaust an export browser | Remediated at the application layer: proof images are validated and capped, and presentation export now fetches and decodes one image at a time. Constrained Chromebook export testing remains a release-quality check. |
| 13 | Upload limits were checked only after full buffering | Remediated: proof bodies are streamed and cancelled above 500 KB. |
| 14 | Small images retained EXIF metadata | Remediated: every client proof is canvas re-encoded before upload. |
| 15 | Failed proof photos remained indefinitely | Remediated: seven-day purge, membership scoping, discard, leave, and removal cleanup. |
| 16 | Hidden boards were returned before reveal | Remediated: player/public state omits tasks and assignments while hidden. |
| 17 | New host PINs were short and throttling was volatile/shared | Remediated: generated PINs are eight digits, new rooms require eight characters, legacy rooms remain compatible, and failed attempts are persisted separately by browser and network. |
| 18 | Proof MIME was trusted without byte validation | Remediated: JPG, PNG, and WebP signatures and dimensions are validated and MIME must match. |
| 19 | Pending proofs were not scoped to a student membership | Remediated: membership is part of every pending-proof key, query, retry, and cleanup path; unmatched legacy rows are purged. |
| 20 | JSON bodies had no application limit | Remediated: JSON is streamed through a 64 KB limit before parsing. |

## Verification evidence

- Twenty-seven automated tests pass, including hidden-state privacy, roster
  minimization, targeted deletion, invalid/oversized image rejection,
  normalized image filenames, shared-network room/join limits, host-PIN
  throttling, socket/action ceilings, accessibility structure, and
  membership-scoped shared-device queues.
- The same-network capacity rehearsal covers three independent teachers and a
  30-student class. The incident rehearsal covers health, closing a leaked-code
  lobby, deleting an unintended proof, and abandoning the room.
- The production build and TypeScript checks pass.
- The dependency audit reports zero known vulnerabilities.
- Wrangler packages the Worker and assets successfully in dry-run mode.
- A two-origin local browser smoke test completed host setup, student join,
  start, task completion, review, targeted deletion, student leave/clear, and
  room abandonment.
- Phone-size and 200%-equivalent reflow checks found no horizontal overflow,
  unnamed controls, unlabeled fields, duplicate IDs, or missing image
  alternatives on the representative pages tested. The confirmation dialog
  also traps focus, closes with Escape, restores focus, and prevents background
  interaction.
- A headed Chromium check verified the visible skip link and main-content focus
  transfer, reduced-motion media behavior, mobile support-contact rendering,
  corrected landing-footer contrast, and a clean room-abandonment return with
  no stale room request.

## Remaining release risk

This is a local readiness result, not a production security certification.
Broad school distribution still requires:

- Real Chromebook, assistive-technology, shared-device, and school-NAT tests.
- Current Cloudflare plan, CPU, memory, Durable Object storage, request, and
  WebSocket limit verification.
- Production logging/alerts and a rehearsed incident/rollback procedure.
- A monitored public support/privacy address and named response owner.
- School or district approval for notices, nicknames, optional photos,
  deletion, and exports.
- Live post-deployment checks after an explicitly approved release.
