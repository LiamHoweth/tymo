# Deploying Tymo

The demo runs on Railway at **https://tymo-app-production.up.railway.app**:
a `tymo-app` service (this repo) and a `Postgres` database in the
Railway project `tymo`.

## How it runs

- `npm run start` runs `db:prepare` (migrations, then the demo seed only
  into an empty database when `TYMO_SEED_DEMO=1`) and then `next start`.
- `src/instrumentation.ts` calls `/api/cron/tick` once a minute when
  `TYMO_INTERNAL_CRON=1`, so holds expire, requests time out and staff
  reminders go out without an external scheduler. This assumes one app
  instance.
- Deploy from this folder with `railway up --service tymo-app`. To deploy
  on every push instead, connect the GitHub repo to the service in the
  Railway dashboard.

## Variables on `tymo-app`

| Variable | Demo value | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Private-network Postgres |
| `APP_URL` | the public URL | Links in emails and Stripe return URLs |
| `CRON_SECRET` | random | Protects `/api/cron/tick` |
| `TYMO_INTERNAL_CRON` | `1` | In-process sweep every minute |
| `TYMO_SEED_DEMO` | `1` | Seed Redbud into an empty database |
| `TYMO_DEMO` | `1` | One-tap demo sign-in on `/staff/login` |
| `PAYMENTS_MODE` | `fake` | Switch to `stripe` with the keys below |

`TYMO_DEMO=1` lets anyone with the link sign in as the demo owner or
staff. Never set it, or `TYMO_SEED_DEMO`, for a real facility.

## Switching on Stripe test mode

Do these in your own Stripe and Railway dashboards (keys stay out of chat
and out of this repo).

1. **Stripe, test mode:** open Connect and finish the platform setup
   (platform profile, "Platform or marketplace").
2. **Keys:** Developers > API keys. Copy the test publishable key
   (`pk_test_...`) and the test secret key (`sk_test_...`).
3. **Webhook:** Developers > Webhooks > Add endpoint
   `https://tymo-app-production.up.railway.app/api/stripe/webhook`,
   listening to **events on connected accounts**, event `account.updated`.
   Copy its signing secret (`whsec_...`).
4. **Railway:** `tymo-app` > Variables. Set `STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and change
   `PAYMENTS_MODE` to `stripe`. Railway rebuilds (the publishable key is
   baked in at build time).
5. **Connect the demo facility:** sign in as the owner, open Settings,
   tap **Connect payouts** and finish Stripe's test onboarding (Stripe
   shows test values to use). This replaces the seed's placeholder
   account. Until it is done, the booking page fails at the card step.
6. **Try it:** book with `4242 4242 4242 4242`, approve it as staff, and
   find the payment, the 2% application fee and the payout schedule in
   Stripe's test dashboard.

## Email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sending domain). Without
them, emails are written to the `email_outbox` table only, and staff
sign-in links can't reach anyone outside demo mode.
