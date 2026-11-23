<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Start with `README.md` for commands and entry points, `docs/ARCHITECTURE.md` for module ownership and booking rules, and `docs/DEPLOY.md` for Railway. Check `AGENT_NOTES.md` for the current handoff.
- Make web changes in the app that owns the user journey. `tymo-web` owns Richard's Tymo site and its quote intake, `company-web` owns facility pages and renter booking, `company-services` owns the staff experience, and `tymo-services` owns booking platform jobs and HTTP endpoints.
- Apps share logic through `packages/` and never import each other. Keep booking rules in `packages/company`, payments and identity in `packages/platform`, and UI primitives in `packages/ui`.
- `packages/db/src/schema.ts` and `packages/shared/src/types.ts` are shared contracts. Change them only when you must, and keep changes additive.
- Server code imports `server-only`. Money is integer cents. Instants are UTC; display uses the facility time zone via Luxon.
- App UI uses the primitives in `packages/ui` (`@tymo/ui`) and the tokens in `packages/ui/src/theme.css` (court navy, one accent, extra-wide uppercase display type with outlined words, pill controls, dark ink cards). Mobile-first at 375px; tap targets at least 44px; status always in words.
- This repo is public: no secrets, no real facility or person names in code, seeds or tests. The demo facility is the fictional "Redbud Soccer Complex".
- Run `npm ci` at the root. Parallel agents in the same checkout should coordinate dependency installs and avoid running Next dev, type generation, or builds for the same workspace concurrently because they share `.next/`.
- Before committing, run `npm run typecheck`, `npm run lint`, and `npm test`. Build each changed Next.js workspace with `npm run build -w @tymo/<app>`.
- Use a dedicated database for local tests that need PostgreSQL. `npm run db:reset` clears the local demo database. Keep production quote inquiries in the Tymo project's lead database and out of booking tenants, source, logs and test fixtures.
