# Tymo

**Get booked. Get paid.** Branded booking and payments for sports
facilities: renters pick a field and time on the facility's own page and
send a request with their card held; staff approve from a phone; the card
is charged and the facility gets paid.

This repository is v1: one booking, end to end, at one facility.

**Live demo:** https://tymo-app-production.up.railway.app (made-up
facility, fake payments; staff side has one-tap demo sign-in). See
[docs/DEPLOY.md](docs/DEPLOY.md) for the Railway setup and how to switch on
Stripe test mode.

## Run it locally

Requires Node 24+. No database server or Stripe account needed for local
dev: the app uses an embedded PGlite database and a fake payment provider.

```bash
npm install
npm run db:reset   # create .data/pglite, migrate, seed the demo facility
npm run dev        # http://localhost:3000
```

- Customer flow: http://localhost:3000/book/redbud
- Staff app: http://localhost:3000/staff (sign-in links appear in the dev
  outbox at http://localhost:3000/dev/outbox)
- Fake cards: any 16 digits succeed; `4000 0000 0000 0002` declines.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm test` | Unit and integration tests (Vitest + PGlite) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate SQL migrations from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed the demo facility |
| `npm run db:reset` | Delete local data, migrate and seed |

## Configuration

Copy `.env.example` to `.env.local`. Set `DATABASE_URL` for Postgres,
`STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` +
`STRIPE_WEBHOOK_SECRET` for real payments, and `RESEND_API_KEY` for email
delivery.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack, module map
and the booking rules the code enforces.
