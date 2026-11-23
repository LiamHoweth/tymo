# Deploying Tymo

The hosted demo uses two Railway projects in Erjon's workspace. **Tymo**
hosts Richard's static marketing site. **Advance Soccer Complex** hosts a
public Tymo proposal preview and a separate Redbud sample booking flow.
Staff, platform services, and Postgres use the project's private network.

| Railway service | Source root | Build | Start | Readiness |
| --- | --- | --- | --- | --- |
| `tymo` | `/apps/tymo-web` | — | `npm start` | `/` |
| `tymo-services` | `/` | `npm run build -w @tymo/tymo-services` | `npm run start -w @tymo/tymo-services` | `/api/health` |
| `advance-web` | `/` | `npm run build -w @tymo/company-web` | `npm run start -w @tymo/company-web` | The configured proposal route (`/facility/advance`) |
| `redbud-staff` | `/` | `npm run build -w @tymo/company-services` | `npm run start -w @tymo/company-services` | `/staff/login` |

Use Railpack with Node 24 (`RAILPACK_NODE_VERSION=24`). The three workspace
apps install with `npm ci` (`RAILPACK_NODE_NPM_INSTALL=npm ci`). Keep
`RAILPACK_PRUNE_DEPS=false` on `tymo-services` because its start command
uses `tsx` to run `db:prepare`. Start it first on a fresh database so the
other apps have a migrated schema and seeded demo data. For Git deploys,
each Next service watches its own app, `packages/`, and the root package
manifests and TypeScript config. The static service watches `apps/tymo-web/`.

## Variables

Set on the three workspace apps unless noted. Store secret values in
Railway variables. `.env.example` lists their names for local development.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, using private networking and a role that can `SET ROLE tymo_app` |
| `PORT` | `8080` for all four web services, also the public domain's target port |
| `COMPANY_WEB_URL` | Public URL of the company website (booking links) |
| `COMPANY_SERVICES_URL` | Company services base URL, currently `http://redbud-staff.railway.internal:8080` |
| `TYMO_SERVICES_URL` | Core platform base URL, currently `http://tymo-services.railway.internal:8080` |
| `TYMO_WEB_URL` | Public URL of the Tymo website |
| `NEXT_PUBLIC_TYMO_WEB_URL` | Company website only, at build time: "Bookings by Tymo" footer link |
| `SESSION_SECRET` | Company website only. Generate a private random value for signing checkout state |
| `CRON_SECRET` | Tymo services only. Generate a private random value to protect `/api/cron/tick` |
| `TYMO_INTERNAL_CRON=1` | Tymo services, single instance: run the sweep every minute in-process |
| `PAYMENTS_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `TYMO_FEE_BPS` | Payments (fake when unset) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email delivery (outbox only when unset) |
| `TYMO_SEED_DEMO=1` | Tymo services, demo only: seed Redbud into an empty database |
| `TYMO_DEMO=1` | Private demo staff service only: one-tap sign-in to fictional accounts |
| `TYMO_PUBLIC_PREVIEW=1` | Company website only. Keep sample fields, prices and availability visible and disable checkout |
| `TYMO_FACILITY_PROFILE` | Company website only. Runtime JSON that defines the separate proposal landing and links to the actual facility's current site and rental portal |

Use `PAYMENTS_MODE=fake` throughout the demo and keep Stripe and Resend keys
unset. Enable public domains on the marketing and facility web services. Keep
the demo staff and platform services on the private network and leave the
database TCP proxy disabled. A real facility needs its own configuration and
must keep `TYMO_DEMO` and `TYMO_SEED_DEMO` unset.

### Facility proposal profile

Add the profile to `advance-web` with `TYMO_PUBLIC_PREVIEW=1`. The project's
public root then redirects to `/facility/<slug>`. The profile is separate
from booking data, and its links are for the prospect's current website
and rental portal. For example:

```json
{
  "slug": "example-complex",
  "name": "Example Soccer Complex",
  "location": "Example City, OK",
  "description": "Outdoor and indoor spaces for soccer.",
  "officialSiteUrl": "https://example.com/",
  "officialBookingUrl": "https://example.com/rentals",
  "address": "Example City, OK",
  "highlights": [{ "title": "Indoor turf", "description": "A covered practice space." }]
}
```

The booking URL, address, and highlights are optional. Use HTTPS links and
a slug other than `redbud`, which is reserved for the fictional demo. Set
the `advance-web` readiness path to the profile's `/facility/<slug>` route.

## Deployment checks

Use `railway status` and `railway deployment list` with the explicit project
and service. Check the deployed commit and the configured readiness path.
Follow the proposal's sample booking link to `/book/redbud` and verify that
sample availability opens in preview mode. Check the official rental link
against the facility's public website. For workflow changes, exercise full
fake checkout and staff approval locally
with `npm run dev`. Use the deployed marketing form only with authorization
to send an inquiry to the existing Formspree destination.

## Switching on Stripe test mode

Do these in your own Stripe and hosting dashboards (keys stay out of chat
and out of this repo). Use a separate test deployment with authorized staff
access and a reachable webhook URL. The public preview runs in fake mode.

1. **Stripe, test mode:** open Connect and finish the platform setup.
2. **Keys:** Developers > API keys: the test publishable key (`pk_test_...`)
   and test secret key (`sk_test_...`).
3. **Webhook:** Developers > Webhooks > Add endpoint
   `<TYMO_SERVICES_URL>/api/stripe/webhook`, listening to **events on
   connected accounts**, event `account.updated`. Copy the signing secret.
4. **Variables:** set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   (company website build), `STRIPE_WEBHOOK_SECRET` (Tymo services) and
   `PAYMENTS_MODE=stripe`, then redeploy.
5. **Connect a facility:** sign in to company services as the owner, open
   Settings, tap **Connect payouts** and finish Stripe's test onboarding.
6. **Try it:** book with `4242 4242 4242 4242`, approve it as staff, and
   find the payment and the 2% application fee in Stripe's test dashboard.

## Email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sending domain). Without
them, emails are written to the `email_outbox` table only, and staff
sign-in links can't reach anyone outside demo mode.
