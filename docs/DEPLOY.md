# Deploying Tymo

Nothing is deployed right now. (A Railway demo ran on 2026-11-22 and was
deleted.) Each app deploys on its own:

| App | Where | Build | Start |
| --- | --- | --- | --- |
| `apps/tymo-web` | Any static host (Netlify: publish directory `apps/tymo-web`, no build) | none | none |
| `apps/tymo-services` | Node host (Railway service) | `npm run build -w @tymo/tymo-services` | `npm run start -w @tymo/tymo-services` (runs migrations first) |
| `apps/company-web` | Node host | `npm run build -w @tymo/company-web` | `npm run start -w @tymo/company-web` |
| `apps/company-services` | Node host | `npm run build -w @tymo/company-services` | `npm run start -w @tymo/company-services` |

The three Node apps share one Postgres database. Deploy from the repo root
(npm workspaces), with each service's build and start commands as above.
Only `tymo-services` runs migrations on start (`db:prepare`), so start it
first on a fresh database.

## Variables

Set on all three Node apps unless noted:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Shared Postgres (a role that can `SET ROLE tymo_app`) |
| `COMPANY_WEB_URL` | Public URL of the company website (booking links) |
| `COMPANY_SERVICES_URL` | Public URL of company services (staff, sign-in, Stripe return) |
| `TYMO_SERVICES_URL` | Public URL of Tymo services |
| `TYMO_WEB_URL` | Public URL of the Tymo website |
| `NEXT_PUBLIC_TYMO_WEB_URL` | Company website only, at build time: "Bookings by Tymo" footer link |
| `CRON_SECRET` | Tymo services: protects `/api/cron/tick` |
| `TYMO_INTERNAL_CRON=1` | Tymo services, single instance: run the sweep every minute in-process |
| `PAYMENTS_MODE`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `TYMO_FEE_BPS` | Payments (fake when unset) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email delivery (outbox only when unset) |
| `TYMO_SEED_DEMO=1` | Tymo services, demo only: seed Redbud into an empty database |
| `TYMO_DEMO=1` | Company services, demo only: one-tap demo staff sign-in |

Never set `TYMO_DEMO` or `TYMO_SEED_DEMO` for a real facility.

## Railway, from scratch

```bash
railway init --name tymo
railway add --database postgres
railway add --service tymo-services --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway add --service company-web --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway add --service company-services --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
```

For each service, set its build and start commands (table above) in the
Railway dashboard, deploy with `railway up --service <name>`, generate a
domain with `railway domain --service <name>`, then set the four URL
variables on every service.

## Switching on Stripe test mode

Do these in your own Stripe and hosting dashboards (keys stay out of chat
and out of this repo).

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
