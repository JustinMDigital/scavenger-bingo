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
- Google Cloud/OAuth/Drive owner:
- Domain/DNS and TLS owner:
- School approval recorded for:
  - [ ] Activity and student notice
  - [ ] Nickname guidance
  - [ ] Photo policy, or photos confirmed disabled
  - [ ] Individual and room deletion
  - [ ] Host presentation/proof ZIP exports and separately retained copies
  - [ ] Optional player same-team presentation exports and separately retained
        copies, or player export confirmed disabled

## Release evidence

- Package version:
- Commit identifier:
- Source timestamp:
- Public-configuration fingerprint:
- Worktree clean:
- Generated release identifier:
- CI run URL and result:
- Release preflight time and result:
- Deployment URL:
- `/release.json` identity verified:
- Active Worker version:
- Active Worker deployment tag:
- Baseline security headers verified:
- Last-known-good Worker version:
- Cloudflare plan:
- Custom domain and TLS verified:
- Google Drive API and OAuth web client verified:
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
- [ ] Player presentation export is absent by default.
- [ ] A host can authorize player presentation export before the hunt and
  cannot newly enable it after the hunt starts.
- [ ] An authorized player still cannot export until review and board reveal,
  then can export only the same team's current board.
- [ ] The player must confirm each separate copy. Full roster, cross-team data,
  and proof ZIP export remain host-only.
- [ ] On a shared Chromebook, Google code loads only after the export action,
  account selection appears on every attempt, and no prior access token or
  selected account is reused by the app.
- [ ] Leaving, targeted deletion, room abandonment, and expiry messaging make
  clear that a downloaded or Google Drive copy must be deleted separately.
- [ ] One student's data and proof are deleted and can no longer be opened.
- [ ] Leaving clears the student's identity and queued proof from the device.
- [ ] Abandoning the room removes it.

## Incident rehearsal

- [ ] Leaked room code: close the lobby, remove unexpected members, and replace
  the room if needed.
- [ ] Unintended photo: delete the student's data and confirm the proof is gone.
- [ ] Separately retained export: identify the host or authorized player copy
  and follow the organization's deletion process; do not promise remote recall.
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
