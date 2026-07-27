# Scavenger Blackout

Scavenger Blackout is a temporary, mobile-first scavenger-hunt game that anyone
can host for friends, family, a class, a workplace, or another group. A React
client and Cloudflare Worker ship together; each live room uses a Durable Object
and expires after seven days.

## Local verification

```sh
npm install
npm run check
```

`npm run check` runs the Worker/client tests and builds the complete production
bundle. For local browser testing:

```sh
npm run dev
```

Do not use `npm run deploy` until the release checklist is complete and the
Cloudflare account, public support channel, rollback owner, and production
domain are confirmed.

## Release documents

- [Product and safety intent](PRODUCT.md)
- [Privacy inventory](PRIVACY.md)
- [Operations and incident runbook](OPERATIONS.md)
- [Pilot rehearsal record](PILOT_REHEARSAL.md)
- [Release checklist](RELEASE_CHECKLIST.md)
- [Security reporting](SECURITY.md)
- [Cloudflare setup](CLOUDFLARE_SETUP.md)

The classroom starter and blank-room default do not collect photos. Photo
activities are an opt-in host choice and require participant approval plus any
additional approval that applies to the group.

Production deployment also requires `VITE_SUPPORT_EMAIL` to contain a monitored
public address. The deploy command stops before publishing if that contact is
missing or invalid.

The public site includes `/privacy`, `/terms`, and `/support` pages. Keep those
links current and use the deployed URLs when the Google OAuth branding details
are eventually submitted.
