# Tymo website

Tymo's marketing site uses HTML, CSS and JavaScript with self-hosted fonts
and photos. Its Node HTTP server serves the site and handles website
requests: company intakes (demo requests) and quote requests.

- Preview locally: `npm run dev -w @tymo/tymo-web` (or `npm run dev` at the repo root), then open http://localhost:3003.
- `POST /api/intake` accepts the company intake form on `/company-intake.html` ("Book a demo"; `/demo` and `/company-intake` redirect there). It replaces the former Formspree form and takes the page's multipart post as well as a native form post. Each served page carries a fresh `_request_id`, so a retried form is saved once.
- `POST /api/quote` still accepts the older quote form fields, although the redesigned site no longer shows that form.
- Both save to the `tymo_quote_requests` table in the database configured by `TYMO_LEADS_DATABASE_URL` (`kind` is `company_intake` or `quote`). Each new request is emailed to `TYMO_QUOTE_NOTIFY_TO` when `RESEND_API_KEY` and `EMAIL_FROM` are set (`scripts/quote-notify.mjs`), and the outcome is recorded on the request.
- `/admin` is a read-only list of website requests for signed-in staff, with a page per request. Locally sign in with `admin1` / `admin1`. Production needs `TYMO_ADMIN_USER`, `TYMO_ADMIN_PASSWORD` and `SESSION_SECRET`, or admin sign-in stays off.
- Run `npm run start -w @tymo/tymo-web` from the repository root on Railway. The server uses `PORT` and reports database readiness at `/api/health`.
- For deployment and operator access, see [the deployment guide](../../docs/DEPLOY.md).
