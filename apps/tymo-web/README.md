# Tymo website

Tymo's marketing site uses HTML, CSS and JavaScript with self-hosted fonts
and photos. Its Node HTTP server serves the site and handles quote requests.

- Preview locally: `npm run dev -w @tymo/tymo-web` (or `npm run dev` at the repo root), then open http://localhost:3003.
- `POST /api/quote` accepts the quote form and saves inquiries to the database configured by `TYMO_LEADS_DATABASE_URL`.
- Run `npm run start -w @tymo/tymo-web` from the repository root on Railway. The server uses `PORT` and reports database readiness at `/api/health`.
- For deployment and operator access, see [the deployment guide](../../docs/DEPLOY.md).
