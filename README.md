# Tymo

**Get booked. Get paid.** Branded booking and payments for businesses that
rent time: renters request a time on the business's own page with their
card held; staff approve from a phone; the card is charged and the business
gets paid.

## Repository map

Four separate apps, two for Tymo and two for each company (facility) that
uses Tymo, sharing code through packages.

| | Website | Services |
| --- | --- | --- |
| **Tymo** | [`apps/tymo-web`](apps/tymo-web): marketing site and quote intake | [`apps/tymo-services`](apps/tymo-services): Stripe webhooks, scheduled sweep, email outbox |
| **Company** | [`apps/company-web`](apps/company-web): facility landing pages and renter booking | [`apps/company-services`](apps/company-services): the facility staff app (approvals, calendar, blocks, settings) |

| Package | What it holds |
| --- | --- |
| [`packages/company`](packages/company) | Company logic: the booking engine, demo seed data, dev database |
| [`packages/platform`](packages/platform) | Tymo logic: payments (Stripe Connect), email, staff sign-in |
| [`packages/db`](packages/db) | Schema, migrations, database connections |
| [`packages/ui`](packages/ui) | Design system: tokens (`theme.css`) and React primitives |
| [`packages/shared`](packages/shared) | Types, formatting, server config |

## Run it locally

Requires Node 24+. No database server or Stripe account needed: a shared
embedded database (PGlite) and a fake payment provider stand in.

```bash
npm ci
npm run dev
```

| App | URL |
| --- | --- |
| Redbud facility page | http://localhost:3000/facility/redbud |
| Renter booking | http://localhost:3000/book/redbud |
| Company services | http://localhost:3001/staff |
| Tymo services | http://localhost:3002 (sign-in emails at http://localhost:3002/dev/outbox) |
| Admin console | http://localhost:3002/admin (development sign-in admin1 / admin1) |
| Tymo website | http://localhost:3003 |

`npm run dev` also starts the dev database on port 5433 and seeds the demo
facility, Redbud Soccer Complex (made up), the first time. Sign in to the
staff app as `owner@redbud.example` or `staff@redbud.example`; the link
lands in the dev outbox. Fake cards: any 16 digits work, `4000 0000 0000
0002` declines.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev database + all four apps |
| `npm test` | Unit and integration tests (Vitest + PGlite) |
| `npm run typecheck` | TypeScript in every workspace |
| `npm run lint` | ESLint |
| `npm run build` | Production build of every app |
| `npm run db:reset` | Wipe local data, migrate and seed (stop `npm run dev` first) |
| `npm run db:generate` | Generate SQL migrations from the schema |

The hosted facility proposal uses public profile data at runtime and keeps
fictional Redbud prices and availability in the separate booking preview.

GitHub Actions runs typecheck, lint, tests, and the production builds on pull
requests. See [AGENTS.md](AGENTS.md) for contribution rules,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for booking rules, and
[docs/DEPLOY.md](docs/DEPLOY.md) for Railway setup and quote review. The
[site roadmap](docs/MARKETING.md) covers the path from inquiries to pilots.
