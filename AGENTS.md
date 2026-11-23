<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Read `docs/ARCHITECTURE.md` first. Its booking rules are final decisions.
- `src/server/db/schema.ts` and `src/lib/types.ts` are shared contracts. Change them only when you must, and keep changes additive.
- Server code imports `server-only`. Money is integer cents. Instants are UTC; display uses the facility time zone via Luxon.
- UI uses the primitives in `src/components/ui` and the tokens in `src/app/globals.css` (court navy, one accent, extra-wide uppercase display type with outlined words, pill controls, dark ink cards). Mobile-first at 375px; tap targets at least 44px; status always in words.
- This repo is public: no secrets, no real facility or person names in code, seeds or tests. The demo facility is the fictional "Redbud Soccer Complex".
- Before committing: `npm run typecheck`, `npm run lint`, `npm test`.
