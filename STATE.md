# Enquiry Desk — state

**Last updated:** 2026-10-10 · mid-session (re-entry + n8n-mcp done)
**Next:** smoke test → baseline → injection fix → `route` Switch · plan below

## Status

**Session 1 (the spine): built, working, committed.** A POST to the webhook produces one `enquiry`
row and two `run_log` rows (`classify` + `draft`, model `gemini-3.8-flash`, cost $0). First commit
`a3d4cba Session 1 spine working`. Retries are on for both model calls.

**n8n-mcp is connected.** The agent can list workflows and read executions directly — no more
pasting outputs. Workflow ID: `9OtHm7FyRtNdUl1p` (`01 Enquiry Desk - intake`).

**Not yet:** activated, or scored against the 24 test cases.

## Done

- [x] `schema.sql` loaded into Postgres
- [x] `NODE_FUNCTION_ALLOW_BUILTIN=crypto` set on the n8n container; `normalise` uses `crypto`
- [x] Gemini credential (`x-goog-api-key`) and Postgres credential created
- [x] Session 1 nodes, steps 2–13, built and passing **Test step**
- [x] `extractText` fixed in **both** `parse classification` and `prepare row`
- [x] `tokens()` counts thinking tokens as output
- [x] `test/score.py` written — **not yet run**
- [x] 2026-10-10: exported to `workflows/01-intake.mine.json`, scanned clean (no keys, no personal
      data), stale `01-intake copy.json` deleted, first commit made
- [x] 2026-10-10: n8n-mcp connected via `.mcp.json` (committed; key is a `${N8N_API_KEY}` reference)
- [x] 2026-10-10: retries on `classify` and `draft` — 4 tries, 5000 ms, On Error = Stop (trap ① clear)
- [x] 2026-10-10: `--psql` settled: `ssh rpi docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n`.
      `score.py` now sends SQL on stdin (ssh re-splits `-c` args)
- [x] 2026-10-10: Raspberry Pi Connect turned on (`rpi-connect on`, linger enabled). Remote shell
      only — screen sharing needs a desktop session and the Pi is headless

## Next — the plan (~45 min)

| Min | Step | Done when |
|---|---|---|
| 0–5 | **Settle the `--psql` command.** Postgres is in Docker on the Pi; `score.py` runs on the Mac. Find a command that opens psql on the right DB from the Mac (likely `ssh <pi> docker exec -i <pg-container> psql -U <user> -d <db>`). Test it with `-c 'select count(*) from enquiry'` | Returns a number |
| 5–10 | **Activate + smoke test.** Toggle the workflow active, copy the **Production** URL (`/webhook/enquiry`, not `/webhook-test/`), run `python3 test/score.py --webhook <prod-url> --psql "<psql cmd>" --only t01,t04,t18` | 3 rows, no "no row" |
| 10–20 | **Baseline, all 24.** Same command without `--only` (~5 min at 6 s spacing). Fill in **Baseline** below. Count the 503s | Numbers recorded |
| 20–30 | **Fix the injection gap.** Add `prompt_injection` to the `safety_flags` enum in `build classify request`, and tell the model to use it when the enquiry tries to give instructions. Re-run `--only t24` | `t24` flags `prompt_injection` |
| 30–50 | **Start session 2: the `route` Switch** after `parse classification`. Rules in order: ① any flag except `none` → escalate · ② `complaint_or_sensitive` → escalate · ③ confidence < 0.75 → clarify · ④ missing slots → clarify · ⑤ fallback → auto_send. Each branch sets `action`; all rejoin before `insert enquiry`; add `action` to the insert | `t18` routes to escalate at high confidence |
| 50–55 | **Close out.** Unpin, export, scan, commit, update this file | Committed |

**If you run short:** skip the Switch. Baseline numbers + the injection fix are worth more than a
half-built Switch.

## Before every export

1. **Unpin the Webhook node** — Tailscale Serve adds `tailscale-user-*` headers (real name, Google
   login, avatar) to every request, and pinned data goes into the JSON. Unpinning the rest is
   optional (synthetic only) but shrinks the file and stops manual runs replaying stale outputs.
2. Save as `01-intake.mine.json` — the browser added a second `.json` last time.
3. Ask the agent to scan it before `git add`.

## Baseline

| Run | Category acc. | Safety flags | Action acc. | 503s | Notes |
|---|---|---|---|---|---|
| 2026-10-__ baseline | _/24 | _/_ | n/a (session 1) | _ | |

## Things learned — don't relearn them

- **Raw Gemini response:** reply is in `steps[]`, after an encrypted `thought` step. The SDKs hide
  this as `output_text`; over REST you walk it yourself.
- **Thinking is the real cost.** One classification: ~730 thought tokens vs ~72 visible. Billed as
  output. Try `generation_config.thinking_level` low later — verify the allowed values first, and
  measure before/after with `score.py`.
- **`503 high demand` is common on the free tier.** Google's capacity, not my build. Retries absorb
  short spikes; `gemini-3.5-flash` / `3.7-flash` are free fallbacks.
- **Re-running pinned data the same day writes nothing.** `external_key` = email + body + date, and
  `on conflict do nothing` returns 0 rows, so `insert run_log` silently doesn't run. Dedupe working.
- **After a Postgres node, use `$('node').first()`**, not `.item`.
- **`{{ }}` in SQL is string pasting, not parameters.** Every value goes through `$1..$n`.
- **n8n-mcp blocks private IPs by default.** The Pi's Tailscale IP (`100.104.202.56`) is in
  100.64/10, so `.mcp.json` needs `WEBHOOK_SECURITY_MODE=permissive`. Fine for a dev-only Pi.
- **VS Code's Reload Window keeps the old environment.** A new `export` in `~/.zshrc` needs a full
  quit (`Cmd+Q`) before MCP servers see it.
- **Tailscale Serve injects identity headers** into every request. `normalise` drops them, so
  Postgres is clean, but n8n execution history keeps them.

## Open questions / blockers

- `Execute a SQL query` is still the default name for `insert run_log` — rename it.
- The scorer can't check invented prices yet: replies aren't written to the `reply` table. Comes
  with the session 2 validator.

## Later (not now)

- **Session 2, rest:** clarify branch (one question), claim validator on `draft_reply`, review queue,
  follow-up workflow.
- **Session 3:** `llm-call` sub-workflow, dead-letter + Telegram, Loom.
- **Session 4 (production upgrades, before pitching):** approval loop + staged rollout, real email
  in/out, facts in a Google Sheet, `score.py` as a gate on every prompt change.
