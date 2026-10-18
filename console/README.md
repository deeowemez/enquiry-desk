# Staff console

A small web app for the people who work the Enquiry Desk queue: what needs a person, what was blocked and why, what each
enquiry did, what it cost, and whether the system is healthy. It replaced the Grafana dashboard (removed 2026-10-18), and it is the
front end the planned facts editing and re-checks will build on. Draft screens are in [`mockups/`](mockups/).

**Phase 1 (built): read-only.** Overview, Needs a person, Enquiries (with a detail drawer), Blocked & why (with a popup per
reason), Cost & models, Health. **Not built yet:** Facts, Prompts, re-check (greyed "soon" in the sidebar).

## Why it has a backend

A browser can't talk to Postgres, and the console must never hold the database login. So one Node process serves the API
and the built web app. The server is also where the privacy rules are enforced.

```
browser ── Tailscale Serve (tailnet only, adds who you are) ── console container ── Postgres (console_ro, views only)
                                                                      └─ review links → the private n8n review page
```

## Privacy and safety rules (tested in `server/api.test.ts`)

- The database login `console_ro` can `SELECT` the `stats_*` views and **nothing else** (`schema/console_role.sql`); it is
  read-only by default. The views (`schema/console_views.sql`) carry no email, subject, message or reply text.
- Reasons shown to staff are built from **fixed vocabularies** (`shared/labels.ts`), never from free text. `run_log.error` is
  bucketed in SQL, never exposed raw.
- The review link carries a secret token, so it is returned only by the enquiry-detail endpoint, as `reviewUrl`, and the page
  sends `Referrer-Policy: no-referrer`. Staff read the actual draft on the n8n review page, as before.
- User input is validated with zod and passed to SQL as bound parameters; a hostile value is treated as data.
- Sign-in is the tailnet: Tailscale Serve sends `Tailscale-User-Login`. The container is published on `127.0.0.1` only, so the
  header can't be forged from outside the Pi. (Another container on the `n8n-stack_default` network could still reach the port;
  fine for this setup, worth a shared secret if the network ever holds untrusted containers.)
- Nothing here writes to the database or calls n8n yet. Facts editing and re-checks will need a separate, narrower write path.

## Run it

```bash
# 1. database side (once, on each database you want it to read)
docker exec -i <postgres> psql -U <user> -d <db> -f - < schema/console_views.sql
docker exec -i <postgres> psql -U <user> -d <db> -v pw="'<password>'" -f - < schema/console_role.sql

# 2. the app
cd console
cp .env.example .env            # CONSOLE_DB_PASSWORD, REVIEW_BASE_URL (the live review page)
docker compose up -d --build    # listens on 127.0.0.1:3100
tailscale serve --bg --https=8444 http://127.0.0.1:3100
```

Development: `npm install`, then `npm run dev:server` (needs `CONSOLE_DEV=1 CONSOLE_DB_HOST=127.0.0.1` and the `.env`) and
`npm run dev:web`. `npm run typecheck`, `npm test` (integration tests against the real database).

## API (all `GET`, all take `?days=` and `?traffic=real|test|both`)

`/api/overview` · `/api/queue` · `/api/enquiries` (filters: outcome, topic, review, flagged, q, page) ·
`/api/enquiries/:id` · `/api/blocked` · `/api/blocked/:kind` · `/api/cost` · `/api/health` · `/api/me`.

## Layout

`server/` Fastify API (`app.ts`, `routes.ts`, `filters.ts`, `map.ts`) · `shared/` types and plain-language labels used by
both sides · `web/` React app (Vite, React Router, TanStack Query; charts are plain SVG) · `mockups/` the draft screens.

## Known limits

- "Both" traffic is the default because every enquiry so far is synthetic; with real traffic, default to Real.
- Older rows from before write-first intake (`status = 'new'`) are never shown.
- The blocked popup shows the latest 20; use Enquiries for the rest.
- "Which fact is missing" is not recorded yet, so the unanswered-questions panel counts by topic only.
