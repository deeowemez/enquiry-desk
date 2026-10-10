# Enquiry Desk — state

**Last updated:** 2026-10-10 · mid-session (workflow now runs on Nova 2 Lite)
**Next:** export + commit → decide how to fix `missing_slots` → `route` Switch · plan below

## Status

**Session 1 (the spine): built, working, published.** A POST to the production webhook produces one
`enquiry` row and two `run_log` rows. Smoke test `t01` passes on every check (run `20261010-175734`).

**Blocked on Gemini's free tier: 20 requests/day per model.** One enquiry = 2 calls, so a 24-case
baseline (48+ calls) can't fit in a day. **Decision: move to Amazon Nova 2 Lite on Bedrock**, paid from
the AWS Free Tier credit ($99 left, expires 2027-03-09). **Rule: credits only** — no models billed
to the card.

**The workflow runs on Nova 2 Lite** (part B done by the agent, 2026-10-10). `t01` and `t18` pass
end to end (~1.5 s per model call vs 30 s+ timeouts on Gemini). Gemini version is commit `9f383b3`.

**Not yet:** reliable `missing_slots`. Session 2 Switch.

## Done

- [x] `schema.sql` loaded into Postgres
- [x] `NODE_FUNCTION_ALLOW_BUILTIN=crypto` set on the n8n container; `normalise` uses `crypto`
- [x] Gemini credential (`x-goog-api-key`) and Postgres credential created
- [x] Session 1 nodes, steps 2–13, built and passing **Test step**
- [x] `extractText` fixed in **both** `parse classification` and `prepare row`
- [x] `tokens()` counts thinking tokens as output
- [x] 2026-10-10: exported to `workflows/01-intake.mine.json`, scanned clean, first commit made
- [x] 2026-10-10: n8n-mcp connected via `.mcp.json` (key is a `${N8N_API_KEY}` reference)
- [x] 2026-10-10: retries on `classify` and `draft` — 4 tries, 5000 ms, On Error = Stop (trap ① clear)
- [x] 2026-10-10: `score.py` sends SQL on stdin. On the Pi, `--psql` is
      `docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n` (no ssh needed)
- [x] 2026-10-10: workflow **published** (n8n 2.x's name for "active"); scorer smoke test runs
- [x] 2026-10-10: `classify` + `draft` timeout 30 s → **90 s** (Gemini thinking was timing out every try)
- [x] 2026-10-10: **email is required.** `normalise` trims, lowercases and validates it, and throws if
      missing/invalid; `enquiry.from_email` is `not null` (Postgres + `schema.sql`)
- [x] 2026-10-10: `contact_email` removed from the `missing_slots` enum (node + `classification.schema.json`).
      The model only sees the body, so it always reported the email as missing → rule ④ would have
      sent every enquiry to *clarify*
- [x] 2026-10-10: Bedrock set up: $5 budget alert (credits excluded), Nova 2 Lite via
      `global.amazon.nova-2-lite-v1:0` in `ap-southeast-1`, n8n credential `Bedrock - API key`, smoke call passed
- [x] 2026-10-10: stale browser tab reverted the API edits in the draft; re-applied, draft = published, re-exported
- [x] 2026-10-10: **Rewired to Bedrock Converse** — new `config` Set node (URL, model, prices); classify
      uses a **forced tool call** (`record_classification`) for structured JSON; parse/prepare read
      `output.message.content[]` + `usage.inputTokens/outputTokens`; timeouts back to 30 s
- [x] 2026-10-10: schema fields got `description`s (Nova over-reported `missing_slots` without them)
- [x] 2026-10-10: `insert enquiry` passes values as an **array expression** — the comma list split
      `["subject","timezone"]` into two params (`there is no parameter $12`)
- [x] 2026-10-10: **Injection fix** — `prompt_injection` in `safety_flags` (node + repo schema), instruction
      to flag it; `t24` label now expects it. Run `20261010-223551`: t24 flags `prompt_injection`, no
      false flags on t01/t16/t18/t20. `language` description back to BCP-47 (matches repo schema)
- [x] 2026-10-10: Raspberry Pi Connect on (remote shell only; the Pi is headless)

## Next — the plan

### A. Nova setup (AWS console, ~20 min)

| Step | What | Done when |
|---|---|---|
| A1 | ✅ **Budget alert** `enquiry-desk-5usd`: $5/month, credits excluded, email at 80% actual (made with the CLI) | Done 2026-10-10 |
| A2 | ✅ **Pick a region** and stay in it. Bedrock → **Cross-region inference**: copy the **inference profile ID** for Nova 2 Lite (e.g. `us.amazon.nova-2-lite-v1:0`, but use what the page shows) | Region + profile ID written below |
| A3 | ✅ **Model access.** Enable Nova 2 Lite in that region if it isn't already | Status "Access granted" |
| A4 | ✅ **API key.** Bedrock → **API keys** → long-term key, **90-day expiry**. Copy it once | Key copied (nowhere but n8n) |
| A5 | ✅ **n8n credential.** Header Auth, Name `Authorization`, Value `Bearer <key>`, called `Bedrock - API key` | Credential saved |
| A6 | ✅ **Smoke call.** Throwaway HTTP Request node: POST `https://bedrock-runtime.<region>.amazonaws.com/model/<profile-id>/converse`, body `{"messages":[{"role":"user","content":[{"text":"Say OK"}]}]}` | 200 with `output.message.content[0].text` |
| A7 | **Credit check.** After 24 h: Cost Explorer, group by Service, charge type Usage + Credit — Bedrock usage offset by a Credit line | Confirmed covered |

Region: `ap-southeast-1` · Nova 2 Lite profile ID: `global.amazon.nova-2-lite-v1:0` (global CRIS)
Endpoint: `https://bedrock-runtime.ap-southeast-1.amazonaws.com/model/global.amazon.nova-2-lite-v1:0/converse`
Open: billing support case — does the Free Tier credit cover Claude on Bedrock?
A6 status: ✅ passed 2026-10-10 — 200, "OK", 881 ms, 48 in / 12 out tokens (account verification cleared). A7 credit check due 2026-10-11

### B. Rewire the workflow ✅ (done by the agent on request, 2026-10-10)

1. **`config` Set node** right after `normalise`: `model_url`, `model_id`, `price_in_per_mtok`,
   `price_out_per_mtok`. Every later node reads from here, so swapping providers (Ollama later) means
   editing one node.
2. **`build classify request` → Converse body:** `system` (instructions), `messages` (the fenced
   enquiry), `inferenceConfig` (`maxTokens`, `temperature: 0`). Structured JSON: use a forced **tool**
   whose `inputSchema` is the classification schema (`toolConfig.toolChoice`), then read the tool input
   back — check the Nova docs for the exact shape first.
3. **`classify` / `draft`:** new URL + credential. Keep retries; the timeout can come back down (~30 s).
4. **`parse classification` / `prepare row`:** new `extractText` (`output.message.content[]`, tool
   input for classify) and `tokens()` (`usage.inputTokens` / `outputTokens`). Real `cost_usd` from the
   config prices.
5. **`build draft request` → Converse body** (plain text, no tool).
6. Publish → `score.py --only t01` → then **baseline, all 24**.

### C. After the baseline

- ✅ Injection fix (2026-10-10)
- Session 2: the `route` Switch (rules ①–⑤ as in the build guide) → `t18` escalates at high confidence

## Before every export

1. **Unpin the Webhook node** — Tailscale Serve adds `tailscale-user-*` headers (real name, Google
   login, avatar) to every request, and pinned data goes into the JSON.
2. Save as `01-intake.mine.json` — the browser added a second `.json` last time.
3. Ask the agent to scan it before `git add`.

## Baseline

| Run | Model | Category acc. | Safety flags | Action acc. | Errors | Notes |
|---|---|---|---|---|---|---|
| 2026-10-10 baseline `20261010-221447` | nova-2-lite | **21/24** (88%) | **5/5** | n/a (session 1) | 0 | Slots **2/6**. Misses: t13→trial_booking, t19→other, t23→course_content. Conf 0.8–1.0 on everything. $0.00094/enquiry. Before the injection fix |

## Things learned — don't relearn them

- **Gemini free tier = 20 requests/day per model** (`gemini-3.8-flash`). A daily-quota 429 can't be
  retried away, and 4 retries may burn 4× the quota. Session 3's `llm-call`: retry on 503/timeout,
  stop on a per-day 429.
- **Gemini thinking makes calls slow.** ~730 thought tokens per classification; 30 s timeouts failed
  every try on the free tier. Raw reply is in `steps[]` after an encrypted `thought` step.
- **n8n 2.x: "Active" is now "Publish".** Save edits the draft; the production URL runs the published
  version. Edits through n8n-mcp were checked and *did* reach the published version (verify with
  `workflow_history` where `versionId = activeVersionId`).
- **A stale browser tab overwrites API edits.** An n8n tab opened before an API/agent edit still holds
  the old workflow; the next Save there silently reverts the edit (happened 2026-10-10 20:24).
  **Reload the n8n tab after every agent edit**, before touching anything.
- **Successful production executions aren't saved** by default — only errors show in the list. Turn
  on Settings → Save successful production executions to see timings and retries.
- **The webhook answers 200 before the workflow runs**, so a throw in `normalise` still returns 200.
  A real 400 needs "Respond to Webhook" — session 3.
- **`docker exec -i … psql` with nothing piped in just waits** (no tty, no prompt). Use `-it` to poke
  around by hand.
- **`.env` isn't loaded automatically:** `set -a; source .env; set +a`.
- **AWS credit applies to "Sold by: AWS" only.** Claude, Grok, GPT etc. on Bedrock are sold by the
  vendor through AWS Marketplace, so the Free Tier credit likely doesn't cover them. Nova is AWS's.
  The console's "Serverless" vs "Bedrock Marketplace" tabs are about hosting, not billing.
- **n8n Postgres `queryReplacement` as a comma list splits values that contain commas.** Use
  `={{ [ $json.a, $json.b ] }}`. Update `Execute a SQL query` the same way when you rename it.
- **The Pi has two AWS CLI profiles.** `default` = account `017820696925` (not the Bedrock one);
  Bedrock + budget live in `718339078322`. Check `aws sts get-caller-identity` or pass `--profile`.
  Budget `enquiry-desk-5usd` confirmed in `718339078322` ($0.50 actual on 2026-10-10).
- **Cross-region inference models need the profile ID** (`us.` / `eu.` / `apac.` / `global.` prefix),
  not the bare model ID.
- **Re-running pinned data the same day writes nothing.** `external_key` = email + body + date;
  `on conflict do nothing` returns 0 rows, so `insert run_log` silently doesn't run.
- **After a Postgres node, use `$('node').first()`**, not `.item`.
- **`{{ }}` in SQL is string pasting, not parameters.** Every value goes through `$1..$n`.
- **n8n-mcp blocks private IPs by default.** Tailscale's 100.64/10 needs
  `WEBHOOK_SECURITY_MODE=permissive` in `.mcp.json`. Fine for a dev-only Pi.
- **Tailscale Serve injects identity headers** into every request. `normalise` drops them, but n8n
  execution history keeps them.

## Open questions / blockers

- ✅ Nova prices set in `config`: $0.30 in / $2.50 out per MTok (Standard tier, 2026-10-10).
- **`missing_slots` is unreliable (2/6)**: over-reports on clear cases (t01, t04, t07, t09), misses
  `subject` on t02. Rule ④ can't trust it as-is. Idea: model extracts what's *present*, code decides
  what's *missing* per category.
- **Confidence isn't calibrated**: 0.8–1.0 on every case, incl. vague t21 (0.8) → rule ③ (< 0.75 →
  clarify) would never fire.
- **Drafted replies can't be reviewed**: not in the `reply` table, and successful executions aren't
  saved. Turn on Save successful production executions (or write `reply`) before checking
  `note_expected` cases.

- The Nova rewrite is **not exported yet** — reload the n8n tab, then export.
- `.gitignore` now ignores `test/results/*` — decide: keep results in git as before/after evidence?
- Scratch files `schema/test.sql`, `test/test.json` — keep out of commits or delete.
- `Execute a SQL query` is still the default name for `insert run_log` — rename it.
- The scorer can't check invented prices yet: replies aren't written to the `reply` table.
- `score.py` doesn't count errors by type (503 / 429 / timeout) — read n8n Executions for now.
- Docstring example for `--psql` in `score.py` is stale (`docker compose`).

## Later (not now)

- **Local LLM backend:** Ollama on the M5 MacBook (16 GB; ~8B model, `format` = JSON schema,
  `think: false`), reached over Tailscale. Score local vs Nova on the same 24 cases. Move to the
  RTX 4060 box if it needs to be always on. Fits in session 3's `llm-call`.
- **Session 2, rest:** clarify branch, claim validator on `draft_reply`, review queue, follow-up.
- **Session 3:** `llm-call` sub-workflow (provider switch + 429-aware retries), dead-letter + Telegram,
  proper 400 via Respond to Webhook, Loom.
- **Session 4 (before pitching):** approval loop + staged rollout, real email in/out, facts in a
  Google Sheet, `score.py` as a gate on every prompt change.
