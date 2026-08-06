# Rally Hunt

Rally Hunt is a temporary, mobile-first scavenger-hunt game that anyone
can host for friends, family, a class, a workplace, or another group. A React
client and Cloudflare Worker with Static Assets ship together; each live room
uses a Durable Object and expires after seven days. This is the sole current
runtime. There is no active Vercel deployment or separate database.

## Local verification

```sh
npm ci
npm run check
npm run test:e2e
```

`npm run check` runs the Worker/client tests and builds the complete production
bundle. `npm run test:e2e` starts an isolated local Worker and runs the
multi-user desktop and phone browser journeys. For exploratory local testing:

```sh
npm run dev
```

The repository CI workflow repeats the tests, production build, release-metadata
check, and browser journeys. For an intended release revision, set the monitored
support address and approved Google OAuth client, then run the non-deploying
preflight:

```sh
npm run release:preflight
```

The preflight requires a clean worktree. `--allow-dirty` is available only for a
local diagnostic run and is not release approval. Production builds include a
`release.json` identity record with the version, source revision, source
timestamp, public-configuration fingerprint, release identifier, and
dirty-source flag. The fingerprint is a SHA-256 digest of the public support
address and Google OAuth client ID; it does not expose either value. Changing
either setting therefore creates a different build and deployment identity even
when the source revision is unchanged.

Do not use `npm run deploy` until the release checklist is complete and the
Cloudflare account, public support channel, rollback owner, and production
domain/TLS are confirmed. Deployment, account changes, DNS, and Google Cloud
configuration are separate explicitly approved actions. The deploy command also
requires the explicitly approved 32-character account identifier in
`CLOUDFLARE_ACCOUNT_ID` and refuses to rely on Wrangler's cached account.

## Release documents

- [Product and safety intent](PRODUCT.md)
- [Privacy inventory](PRIVACY.md)
- [Operations and incident runbook](OPERATIONS.md)
- [Pilot rehearsal record](PILOT_REHEARSAL.md)
- [Release checklist](RELEASE_CHECKLIST.md)
- [Current release candidate status](RELEASE_STATUS_2026-07-31.md)
- [Security reporting](SECURITY.md)
- [Cloudflare setup](CLOUDFLARE_SETUP.md)

The classroom starter and blank-room default do not collect photos. Photo
activities are an opt-in host choice and require participant approval plus any
additional approval that applies to the group.

Player presentation export is also off by default. A host may authorize players
before the hunt to export only their own team's current board after review and
board reveal. Every export requires the player to confirm that it creates a
separate copy. Full rosters, other teams' data, and proof ZIPs remain host-only.
Room deletion or expiry cannot recall a downloaded or Google Drive copy.

Production deployment also requires `VITE_SUPPORT_EMAIL` to contain a monitored
public address and `VITE_GOOGLE_CLIENT_ID` to identify the approved Google OAuth
web client. The release preflight refuses to complete if either value is missing
or invalid, so the deploy command never reaches publishing. The preflight and CI
also audit the complete dependency lockfile, including build and test tooling.

The public site includes `/privacy`, `/terms`, and `/support` pages. Keep those
links current and use the deployed URLs when the Google OAuth branding details
are submitted. Google Drive API/OAuth setup, custom domain/TLS, the production
deployment and account owners, and real device/school approval remain external
release gates.
