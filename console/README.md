# Staff console

A small web app for the people who work the Enquiry Desk queue: what needs a person, what was blocked and why, what each
enquiry did, what it cost, and whether the system is healthy. It replaced the Grafana dashboard (removed 2026-10-18), and it is the
front end the planned facts editing and re-checks will build on. Draft screens are in [`mockups/`](mockups/).

**Phase 1: read-only screens.** Overview, Needs a person, Enquiries (with a detail drawer), Blocked & why (with a popup per
reason), Cost & models, Health.

**Phase 2: the fact table, prompts and tests.**
- **Facts:** the fact table now lives in the database (`fact_set`, versioned). Edit a fact into a *draft*, apply it to
  **staging**, run the **24-case test**, then publish it to production. Publishing is refused unless exactly those facts passed
  the gate (`compare.py`'s rules: safety flags, 0 invented claims, accuracy, cost). Every published version is kept and can be
  restored. Edits are validated against the shape the workflow relies on, so a typo can't crash production.
- **Re-check:** re-send recent (or one) past enquiries to staging with the candidate facts and see which outcomes change. They
  go out under a `test+recheck-…@example.com` address, so there is no Gmail draft, no Telegram alert, and they are not counted
  as real traffic. The enquiry text is read with a narrow login and re-sent by the server; it is never returned to the browser.
- **Prompts:** read-only. A snapshot of the four stages' instructions, generated from the workflow export
  (`npm run prompts`; `npm test` fails if it is stale). Prompts are not editable from here on purpose.

Both workflows read the facts from the database (production since 2026-10-18), so a published version is what customers' replies
are grounded on from the next enquiry on. The first version came from `kb/facts.json`.

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
- **Writes are narrow.** The only thing the console writes is `fact_set` (login `console_facts`: select/insert/update on that one
  table; it has no DELETE, so history is only ever added to; a thrown-away draft is marked `discarded`). It cannot touch
  `enquiry`, `reply` or `run_log`. Every write needs a custom header (`x-console`) a cross-site form cannot send; the person
  is recorded from their tailnet identity. `CONSOLE_READONLY=1` switches every write off.
- **Environments.** Staging has its own database (`enquiry_staging`, synthetic data only). A draft and its tests live there;
  *publish* copies the tested document into production. One test or re-check runs at a time.
- **Re-checks copy an enquiry's text into the staging database.** Fine while every enquiry is synthetic (repo rule 2); with real
  customers that needs the Bedrock data-terms check first, or `CONSOLE_ALLOW_RECHECK=0`.

## Run it

```bash
# 1. database side (once, on each database you want it to read)
docker exec -i <postgres> psql -U <user> -d <db> -f - < schema/console_views.sql
docker exec -i <postgres> psql -U <user> -d <db> -v pw="'<password>'" -f - < schema/console_role.sql
# phase 2, in BOTH databases (enquiry, then enquiry_staging)
docker exec -i <postgres> psql -U <user> -d <db> < schema/facts.sql
node console/scripts/seed-facts.mjs | docker exec -i <postgres> psql -U <user> -d <db>
docker exec -i <postgres> psql -U <user> -d <db> -v facts_pw="'..'" -v staging_pw="'..'" -v recheck_pw="'..'" -f - < schema/console_roles_phase2.sql
# then once: grant select on all tables in schema public to console_staging   (staging database only)
#            grant select (id, subject, body, category, status, received_at) on enquiry to console_recheck   (production only)

# 2. the app
cd console
cp .env.example .env            # the four passwords, REVIEW_BASE_URL (the live review page)
docker compose up -d --build    # listens on 127.0.0.1:3100
tailscale serve --bg --https=8444 http://127.0.0.1:3100
```

Development: `npm install`, then `npm run dev:server` (needs `CONSOLE_DEV=1 CONSOLE_DB_HOST=127.0.0.1` and the `.env`) and
`npm run dev:web`. `npm run typecheck`; `npm run test:unit` (no database); `npm test` (everything, against the real databases; it never publishes).

## API (all `GET`, all take `?days=` and `?traffic=real|test|both`)

`/api/overview` · `/api/queue` · `/api/enquiries` (filters: outcome, topic, review, flagged, q, page) ·
`/api/enquiries/:id` · `/api/blocked` · `/api/blocked/:kind` · `/api/cost` · `/api/health` · `/api/me`.
Phase 2: `GET /api/facts`, `/api/prompts`, `/api/jobs/current`; `POST /api/facts/draft` (`DELETE` discards), `/api/facts/draft/apply`, `/api/facts/publish`, `/api/facts/restore`, `/api/jobs/gate`, `/api/jobs/impact`, `/api/jobs/cancel`.

## Layout

`server/` Fastify API (`app.ts`, `routes.ts`, `filters.ts`, `map.ts`; phase 2: `factsRoutes.ts`, `factsOps.ts` path edits and diffs, `factsRepo.ts` and the publish rule, `jobs.ts` the test and re-check runner, `pools.ts` the five logins) · `shared/` types and plain-language labels used by
both sides · `web/` React app (Vite, React Router, TanStack Query; charts are plain SVG) · `mockups/` the draft screens.

## Known limits

- "Both" traffic is the default because every enquiry so far is synthetic; with real traffic, default to Real.
- Older rows from before write-first intake (`status = 'new'`) are never shown.
- The blocked popup shows the latest 20; use Enquiries for the rest.
- The fact editor adds a fact to an existing section or a deadline; other lists (subjects, slots, admissions) can be edited but not yet extended. A new top-level section is rejected, because no topic would ever be shown it (`shared/factTopics.ts` mirrors the workflow's `select facts`, and a test fails if they drift). `policies` is shown to no topic today.
- The image carries `python3`, `psql` and the scorer, so it is larger than phase 1 (still about 35 MB in memory).
- "Which fact is missing" is not recorded yet, so the unanswered-questions panel counts by topic only.
- Prompt version history is not shown (the console never calls n8n); the Prompts screen is a snapshot of the committed export.
