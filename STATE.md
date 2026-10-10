# Enquiry Desk — state

**Last updated:** 2026-10-07 · end of the session-1 build
**Next session:** ~70 min (1 hour + n8n-mcp setup) · plan below

## Status

**Session 1 (the spine): built and working.** A POST to the webhook produces one `enquiry` row and
two `run_log` rows (`classify` + `draft`, model `gemini-3.8-flash`, cost $0). Classification of the
test payload came back correct: `pricing`, confidence 0.98.

**Not yet:** scored against the 24 test cases, exported to git, or protected by retries.

## Done

- [x] `schema.sql` loaded into Postgres
- [x] `NODE_FUNCTION_ALLOW_BUILTIN=crypto` set on the n8n container; `normalise` uses `crypto`
- [x] Gemini credential (`x-goog-api-key`) and Postgres credential created
- [x] Session 1 nodes, steps 2–12, built and passing **Test step**
- [x] Step 13, `insert run_log`, written by me (parameterised, `.first()` references)
- [x] `extractText` fixed in **both** `parse classification` and `prepare row` — reply lives in
      `steps[]` → `model_output` → `content[].text`
- [x] `tokens()` counts thinking tokens as output
- [x] `test/score.py` written (scorer for the 24 cases) — **not yet run**

## Next session — the plan (~75 min)

The original 1-hour plan, plus ~10 minutes to connect n8n-mcp (host already confirmed). Update this file in the last 5.

| Min | Step | Done when |
|---|---|---|
| 0–5 | **Re-enter + save.** Export my workflow from n8n (⋯ → Download) to `workflows/01-intake.mine.json`. Search it for `key`/`AIza` to confirm no secrets. First commit: `git add -A && git commit -m "Session 1 spine working"` | One commit exists |
| 5–15 | **Connect n8n-mcp** so the agent can read workflows and executions directly. Steps in **n8n-mcp setup** below | `/mcp` shows `n8n-mcp` connected, and the agent can list my workflows |
| 20–25 | **Retries on both model calls.** `classify` and `draft` → Settings → Retry On Fail **on**, Max Tries **4**, Wait **5000**, On Error **Stop Workflow** (trap ①: any "Continue" disables retries) | Both nodes set |
| 25–30 | **Activate + smoke test.** Toggle the workflow active, copy the **Production** URL, run `python3 test/score.py --webhook <prod-url> --psql "<psql cmd>" --only t01,t04,t18` | 3 rows, no "no row" |
| 30–40 | **Baseline run, all 24.** Same command without `--only` (~5 min at 6 s spacing). Write category accuracy + safety-flag score into **Baseline** below | Numbers recorded |
| 40–50 | **Fix the injection gap.** Add `prompt_injection` to the `safety_flags` enum in `build classify request`, and tell the model to use it when the enquiry tries to give instructions. Re-run `--only t24` | `t24` flags `prompt_injection` |
| 50–70 | **Start session 2: the `route` Switch** after `parse classification`. Five rules, in order: ① any flag except `none` → escalate · ② `complaint_or_sensitive` → escalate · ③ confidence < 0.75 → clarify · ④ missing slots → clarify · ⑤ fallback → auto_send. For now, each branch just sets an `action` field and all three rejoin before `insert enquiry`; add `action` to the insert | `t18` routes to escalate at high confidence |
| 70–75 | **Close out.** Export again, commit, update this file | Committed |

**If you run short:** skip 50–70. The baseline numbers and the injection fix are worth more than a
half-built Switch.

**If you finish early:** re-run all 24 with `action` now written — `score.py` will start scoring
action accuracy automatically.

## n8n-mcp setup (the 5–15 step)

**1–2. Host and reachability — done.** n8n runs on the **Raspberry Pi**, served over Tailscale at
**`https://raspberrypi.tailf7a7bf.ts.net`**. `curl -I` from the Mac returned `HTTP/2 200`
(2026-10-10), so no SSH tunnel is needed — just keep Tailscale connected on the Mac.

**3. Prerequisite:** `npx --version` on the Mac. If missing, install Node first.

**4. API key:** n8n → **Settings → n8n API → Create an API key**. Copy it once; n8n won't show it again.

**5. Register the server** (from `~/deeowemez/enquiry-desk`):
```bash
claude mcp add n8n-mcp \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL=https://raspberrypi.tailf7a7bf.ts.net \
  -e N8N_API_KEY=<key from step 4> \
  -- npx -y n8n-mcp
```
**Don't add `-s project`** — that writes the key into `.mcp.json`. (It's in `.gitignore` anyway,
but keep the key in user config.)

**6. Verify:** MCP servers load at session start, so start a **fresh** Claude Code session, run
`/mcp`, then ask: *"list my n8n workflows and show the last execution of 01 Enquiry Desk — intake."*

**What it changes:** the agent can read the workflow and execution errors itself — no more pasting
outputs. It does **not** change rule 1 in `CLAUDE.md`: I still build the nodes. And edits made
through the API still aren't in git, so the export step stays.

## Baseline (fill in tomorrow)

| Run | Category acc. | Safety flags | Action acc. | Notes |
|---|---|---|---|---|
| 2026-10-0_ baseline | _/24 | _/_ | n/a (session 1) | |

## Things learned this session — don't relearn them

- **Raw Gemini response:** reply is in `steps[]`, after an encrypted `thought` step. The SDKs hide
  this as `output_text`; over REST you walk it yourself.
- **Thinking is the real cost.** One classification: ~730 thought tokens vs ~72 visible. Billed as
  output. Try `generation_config.thinking_level` low later — verify the allowed values first, and
  measure before/after with `score.py`.
- **`503 high demand` is common on the free tier.** It's Google's capacity, not my build. Retries
  absorb short spikes; `gemini-3.5-flash` / `3.7-flash` are free fallbacks if it persists. Count
  the 503s during scoring — real numbers for the README.
- **Re-running pinned data the same day writes nothing.** `external_key` = email + body + date, and
  `on conflict do nothing` returns 0 rows, so `insert run_log` silently doesn't run. That's dedupe
  working. `score.py` avoids it by using a unique email per case per run.
- **After a Postgres node, use `$('node').first()`**, not `.item` — item pairing can break there.
- **`{{ }}` in SQL is string pasting, not parameters.** Every value goes through `$1..$n`.

## Open questions / blockers

- `workflows/01-intake copy.json` — stale older answer key. Delete it.
- n8n-mcp not connected — **planned for the next session** (5–15). Host confirmed.
- The scorer can't check invented prices yet: replies aren't written to the `reply` table. Comes
  with the session 2 validator.

## Later (not now)

- **Session 2, rest:** clarify branch (one question), claim validator on `draft_reply`, review queue,
  follow-up workflow.
- **Session 3:** `llm-call` sub-workflow, dead-letter + Telegram, Loom.
- **Session 4 (production upgrades, before pitching):** approval loop + staged rollout, real email
  in/out, facts in a Google Sheet, `score.py` as a gate on every prompt change.
