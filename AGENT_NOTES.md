# Tymo handoff

- Richard's merged marketing design and the first-party quote form live in `apps/tymo-web`. The Railway **Tymo** project runs the site and its dedicated private Postgres. Use the operator command in `docs/DEPLOY.md` to review inquiries.
- The "Book a demo" company intake (`/company-intake.html`) posts to the site's own `POST /api/intake`, not Formspree. Intakes and quotes share `tymo_quote_requests` (`kind`), the request emails and `/admin`.
- The Railway **Advance Soccer Complex** project runs the Tymo facility proposal. The company web service loads the prospect profile from `TYMO_FACILITY_PROFILE`. Local `/facility/redbud` and `/book/redbud` use the fictional tenant.
- Keep `TYMO_PUBLIC_PREVIEW=1` on the hosted proposal. The sample shows prices and availability with checkout disabled. Real inquiries and bookings go to the facility's official links. Platform, demo staff and Postgres stay private.
- `tymo-services` applies migrations and optionally seeds before listening. Keep database work in the explicit `db:prepare` command or service startup so dependency installation works without database access.
- See `docs/DEPLOY.md` for Railway configuration and `docs/MARKETING.md` for the site roadmap.
