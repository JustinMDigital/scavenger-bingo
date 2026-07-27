# Teacher and student pilot rehearsal

Copy this file for each school pilot and keep the completed record with the
release notes. Do not put student names, photos, host PINs, session cookies, or
raw IP addresses in this record.

## Ownership and approval

- Rehearsal date and time:
- School or organization:
- Pilot owner:
- Support/privacy contact:
- Expected response time:
- Cloudflare/log access owner:
- Deployment and rollback owner:
- School approval recorded for:
  - [ ] Activity and student notice
  - [ ] Nickname guidance
  - [ ] Photo policy, or photos confirmed disabled
  - [ ] Individual and room deletion
  - [ ] Host exports and separately retained copies

## Release evidence

- Commit identifier:
- Active Worker version:
- Last-known-good Worker version:
- Cloudflare plan:
- Expected teachers, rooms, and students:
- Test network:
- Devices and browsers:
- Assistive technology used:

## Classroom rehearsal

- [ ] A teacher creates a Classroom Starter room.
- [ ] Two additional teachers can create separate rooms on the same network.
- [ ] At least 30 simulated or participating student devices join without
  sharing identities.
- [ ] A shared Chromebook/browser is cleared between two students; neither
  nickname nor queued photo crosses to the next student.
- [ ] Keyboard-only navigation, visible focus, 200% zoom/reflow, and reduced
  motion are checked.
- [ ] A screen reader announces joining, game status, dialogs, controls, and
  errors understandably.
- [ ] Closing the lobby prevents an unintended late join.
- [ ] One student's data and proof are deleted and can no longer be opened.
- [ ] Leaving clears the student's identity and queued proof from the device.
- [ ] Abandoning the room removes it.

## Incident rehearsal

- [ ] Leaked room code: close the lobby, remove unexpected members, and replace
  the room if needed.
- [ ] Unintended photo: delete the student's data and confirm the proof is gone.
- [ ] Deletion request: complete targeted deletion and record only the time and
  outcome.
- [ ] Service failure: check health and logs, notify the pilot contact, and
  identify the rollback version.
- [ ] Rollback: the owner can locate the control and explain the compatibility
  warning without changing production during a rehearsal.

## Outcome

- [ ] Pilot approved
- [ ] Pilot paused
- Issues found:
- Follow-up owner and date:
- Approval names and timestamps:
