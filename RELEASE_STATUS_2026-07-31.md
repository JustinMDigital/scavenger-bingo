# Release candidate status — July 31, 2026

This record describes the current local candidate. It is not a production
approval or a completed pilot record.

## Source state

- Candidate base commit: `651ceb66f823fae2b4f497aca7ad90643e224f68`.
- The candidate includes uncommitted release hardening, naming, documentation,
  and template-library changes. It therefore cannot be assigned a final release
  identifier until it is reviewed, committed, and checked by GitHub.
- The local production configuration contains a public support address and a
  syntactically valid Google OAuth web client identifier. Human ownership and
  monitoring of the support channel are not yet confirmed. Retired Vercel and
  Supabase entries were removed from the ignored local environment file.

## Verified locally

- `npm run check`: 42 Worker/core tests, 6 release-hardening tests, 20 interface
  tests, type checks, and the production build passed.
- `npm audit --audit-level=high`: no vulnerabilities were found.
- `SCAVENGER_E2E_PORT=43177 npm run release:preflight -- --allow-dirty`:
  dependency audit, tests, build, release metadata, four applicable desktop and
  phone multi-user journeys, and Cloudflare packaging passed. The dirty-source
  override means this is diagnostic evidence only.
- Rendered browser checks passed for the landing page, host entry, public
  template library, family filtering, Quick Bingo template handoff, desktop
  layout, and a 390-by-844 phone layout. No relevant browser warnings or
  horizontal overflow were observed.
- The rate-limit test that timed out on GitHub now reaches the same boundary
  without performing 180 full room saves. The targeted test and full core suite
  pass locally without increasing production or test timeouts.
- Release builds now reject a missing/placeholder support address or Google
  client identifier. GitHub CI supplies explicit test-only public settings and
  uses the guarded release build.

## Current live state — not an approved release

- `https://scavenger-bingo.jusmarr.workers.dev/api/health` is healthy and the
  direct Worker serves base commit `651ceb66f823fae2b4f497aca7ad90643e224f68`.
- That deployment was automatically promoted by Cloudflare while the GitHub
  check was still running; the check later failed. It has no release tag and
  was built without the production support/Google configuration, so it fails
  the repository's deployment verifier and must not be treated as the approved
  release.
- `https://hunt.justinmdigital.com` still resolves to the retired Vercel target
  and returns `DEPLOYMENT_NOT_FOUND`.
- GitHub `main` is not protected and its current check is failed.

## Required external work

These items require authenticated account access or a human-owned real-world
rehearsal and remain incomplete:

1. Review the mixed worktree, create a release-hardening branch, commit it,
   push it, open a pull request, and obtain a green GitHub check.
2. Protect `main` with the required GitHub check and pull-request workflow.
3. In Cloudflare Workers Builds, set the build command to
   `npm run build:release`, set the deploy command to
   `npx wrangler versions upload`, and configure the production public build
   variables. This preserves preview builds without automatically promoting
   them.
4. Confirm the Cloudflare account plan, logs, alerts, rollback access, and
   last-known-good version.
5. Confirm Google Cloud ownership, Drive API enablement, OAuth consent/client,
   authorized local and production origins, and a real browser-to-Drive export.
6. Inventory all current `justinmdigital.com` DNS and email records before any
   nameserver change. Cloudflare Workers Custom Domains require an active
   Cloudflare zone; the current Namecheap-hosted CNAME cannot provide the
   required Worker custom-domain certificate by itself.
7. Configure `hunt.justinmdigital.com`, verify DNS and TLS, then run the clean
   release preflight and controlled tagged deployment.
8. Run the read-only deployment verifier and separately approved live
   create/join, deletion, export-policy, expiry, and abandonment checks.
9. Complete and sign `PILOT_REHEARSAL.md` on the intended physical devices,
   shared device, assistive technology, and target network. Record organizer
   approval, support/incident ownership, and rollback ownership.

Until all applicable rows in `RELEASE_CHECKLIST.md` are supported by current
evidence, pilot distribution and broad self-service release remain unapproved.
