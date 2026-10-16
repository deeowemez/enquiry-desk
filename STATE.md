# Enquiry Desk — state

**Last updated:** 2026-10-16 · **Sessions 1–4 pushed** (`207311d`) · canvas re-layout, `WORKFLOW.md` and dashboard
views committed 2026-10-16, not yet pushed (see *Since the last commit*)
**Next:** publish + re-score → dashboard → README → Loom (see *Next*)

## Status

An n8n workflow that answers customer enquiries for a fictional UK tutoring company (Meridian Tutors) whose
customers are in UTC+8. It classifies each enquiry, answers only from a fact table, checks every claim before
storing a reply, routes risky cases to a person on their phone, and never loses an enquiry. Runs on **Amazon
Nova 2 Lite (Bedrock)**, paid from the AWS Free Tier credit ($99, expires 2027-03-09; **rule: credits only**).

Latest full run `20261011-030241`, 24 hand-labelled cases:

| Category | Safety flags | Missing slots | **Actions** | Invented claims in sendable replies | Failed runs | Cost / enquiry |
|---|---|---|---|---|---|---|
| 22/24 | **6/6** | 6/6 | **23/24** | **0** | 0 | ~$0.0018 |

The one action "miss" is t06 → `blocked`: the draft calculated a £190 bundle price and the validator stopped
it (label says `escalate`; both reach a human). **Nothing is emailed to customers** — approved replies get
`approved_at`; `sent_at` stays empty until a real outbound channel exists.

**What it does, in one line each**
- **Never loses an enquiry:** saved to Postgres before any model call; 202 + reference id in ~0.4 s.
- **Understands, then decides in code:** the model *extracts* (category, details, safety flags); code decides
  what's missing and where it goes. Confidence is recorded, never routed on.
- **Answers only from facts:** each category gets only its facts; a second gate asks "can the facts answer it?".
- **Checks every claim:** prices/dates/times by regex, availability by code, every other statement by a second
  model that must quote its evidence. Any unsupported claim ⇒ `blocked`.
- **People handle the risky ones:** escalated/blocked enquiries → Telegram "needs review" (no customer data) →
  tailnet review page → **Approve draft / Take over**.
- **Fails loudly:** any production failure → row `failed` (dead letter) → `run_log` → Telegram alert →
  `replay.py` re-runs it with one command. Proven by a chaos test.
- **Measured:** `score.py` re-runs the 24 cases after every change; every run is in `test/results/`.

## Since the last commit (2026-10-11 → 14)

- **Canvas re-layout (intake, 47 nodes).** Lines that loop back to the left all share one route in n8n, so 8
  of them overlapped. Now `route` fans out to a column of `action = …` nodes (separate curves), and the three
  branches join at a new **`to record`** No Operation node, so there's one line into ④. Draft only: **Publish** it.
  Logic unchanged (`prepare row` reads only `$input`).
- **`WORKFLOW.md`**: node-by-node walkthrough of stages ①–④ + errors/review workflows, with n8n gotchas.
  Written for someone new to n8n.
- **Dashboard views** in `schema/schema.sql` (applied to the Pi's Postgres): `stats_enquiry` (base: one row per
  enquiry + cost), `stats_daily`, `stats_cost`, `stats_pending_reviews`, `stats_block_reasons`, `stats_health`.
  No view exposes email, subject or body. `day` is Hong Kong time; `is_test` = score.py traffic.
- **Bedrock account hold (2026-10-11).** AWS put the account on hold; every model call returned
  `400 Operation not allowed` (any model, any region; listing models still worked). **Lifted by 10-12**: a
  production run processed 10-12 12:47 UTC, and a test call worked 10-14.

## How it flows

```mermaid
flowchart TB
  subgraph S1["① INTAKE"]
    direction LR
    W([Webhook<br/>POST /enquiry]) --> N[normalise] --> VE{valid<br/>email?} --> RR[(record received<br/>status = received)] --> EN[envelope] --> DU{duplicate?} --> OK[respond 202<br/>+ id] --> CFG[config] --> F[facts]
    VE -. no .-> R4[respond 400]
    DU -. yes .-> R2[respond 200<br/>duplicate]
  end

  subgraph S2["② UNDERSTAND → ROUTE"]
    direction LR
    BC[build classify<br/>request] --> C{{classify<br/>Nova · forced tool}} --> PC[parse<br/>classification] --> D[derive<br/>missing slots] --> R{route<br/>first match wins}
  end

  subgraph S3["③ WRITE & CHECK"]
    direction LR
    A[action =<br/>auto_send] --> SF[select facts] --> DR{{draft<br/>Nova · write_reply}} --> G{answerable?} --> VF{{verify<br/>Nova · record_check}} --> V[validate claims<br/>numbers · availability<br/>+ verifier]
    G -. no .-> E2[action = escalate<br/>gate 2]
    Q[action =<br/>clarify] --> CL{{clarify<br/>one question}} --> V
    E[action =<br/>escalate<br/>no AI draft]
    TR((to record))
  end

  subgraph S4["④ RECORD → REVIEW"]
    direction LR
    P[prepare row] --> IE[(update enquiry<br/>processed)] --> RL[(run_log)] --> RP[(reply)] --> NR{needs<br/>review?} --> OR[(open review<br/>pending + token)] --> TG[/review alert<br/>Telegram link/]
  end

  X[/"01 Enquiry Desk - errors<br/>mark failed → run_log → Telegram"/]
  RV[/"01 Enquiry Desk - review<br/>page → Approve / Take over"/]

  F --> BC
  R -- "① flag · ② sensitive" --> E
  R -- "③ vague · ④ missing" --> Q
  R -- "⑤ fallback" --> A
  V -- "ok · or blocked" --> TR
  E --> TR
  E2 --> TR
  TR --> P
  TG -. "tap Open review (tailnet)" .-> RV
  C -. "any failure" .-> X

  classDef model fill:#fde7c8,stroke:#c97a00,color:#000
  classDef code fill:#dbeafe,stroke:#2563eb,color:#000
  classDef db fill:#dcfce7,stroke:#16a34a,color:#000
  classDef act fill:#f3e8ff,stroke:#7c3aed,color:#000
  classDef gap fill:#fee2e2,stroke:#dc2626,color:#000
  class C,DR,CL,VF model
  class D,R,G,V,EN,VE,DU,NR code
  class RR,IE,RL,RP,OR db
  class A,Q,E,E2,RV act
  class X gap
```

Orange = model calls (the only paid, non-deterministic steps) · blue = code that decides or checks · purple =
outcomes · green = Postgres · red = errors workflow. Simplified: the exact node list is in *Node map*.

## Next

| # | Step | Why |
|---|---|---|
| 1 | ~~**Commit** the re-layout, `WORKFLOW.md` and the views~~ **Done 2026-10-16** | Three finished pieces sitting uncommitted |
| 2 | **Publish** the intake draft, then **re-score** all 24 | Production still runs the old graph; confirms nothing broke and Bedrock is fully back |
| 3 | ~~A7 credit check~~ **Resolved 2026-10-14:** Anthropic models are billed separately via AWS Marketplace and don't use the credit → **Nova only**. Still to do: read the hold notice (what triggered it?) | A second hold mid-Loom would hurt |
| 3b | **Model comparison** (see *Model strategy*): per-stage model settings in `config`, a `--label` on `score.py`, then run Micro / Lite / Nova 2 Lite / Pro | Picks the cheapest set that holds the safety numbers; gives the README a real "why this model" table |
| 4 | **Dashboard** on the `stats_*` views. **Decide:** Grafana (hours, alerts, light on the Pi) vs a React ops console (metrics + review queue in one app, via n8n webhooks; days). Either way, a read-only DB user granted the views only | Makes the reliability visible; goes in the Loom |
| 5 | **README.md**: problem, diagram, the numbers, how it's tested, honest limits, Loom link (`WORKFLOW.md` is the deep dive) | The repo's front page is what reviewers actually read |
| 6 | **Update the two overview stickies** (red one says "session 3 done"; top one says ~$0.001, measured is ~$0.0018), then **record the Loom** | The single most persuasive artefact |
| 7 | **Clean the repo for public view:** `workflows/01-intake.json` (session-1 answer key) vs `01-intake.mine.json`; delete `test/test.json`; resolve the 2 stuck rows | Avoid "which file is the real one?" |
| 8 | Optional: one **real pilot** → one-page case study (confirm Bedrock data terms before any real data) | Turns a portfolio piece into evidence for clients |

### Loom outline (record in segments; ~4–5 min)

| # | Show | Say |
|---|---|---|
| 1 | The main sticky / problem | "UK-staffed tutoring company, customers in UTC+8: the whole Asian day is unstaffed." |
| 2 | POST t01 → **202 + id** in 0.4 s → row `processed`, reply stored | "Saved first, answered only from a fact table, ~0.2¢ per enquiry." |
| 3 | t18 (child wellbeing, confidence 0.95) → **escalate**, no AI draft | "Safety flags beat confidence. A person writes this one." |
| 4 | t06 → draft computes **£190** → **blocked** by the validator | "The model invented a bundle price. Code caught it." |
| 5 | t08 (historical run) → verifier blocks "GCSE Maths on Saturdays" | "A second model checks every sentence against the facts — it caught a real mistake." |
| 6 | t24 injection → flagged `prompt_injection` → escalate | "The enquiry is data, never instructions." |
| 7 | Chaos: break the model URL → POST → **Telegram alert** → `dead_letter` → restore → `replay.py` → processed | "Failures can't vanish: marked, logged, announced, replayed with one command." |
| 8 | Escalated enquiry → Telegram "needs review" → tap **Open review** → **Approve draft** | "A person approves on their phone. No customer data in Telegram; the page is private to the tailnet." |
| 9 | `score.py` summary | "24 labelled cases: 23/24 actions, 6/6 safety flags, 0 invented claims. Re-run on every change." |
| 10 | Honest limits | "Synthetic data, 24 cases, the verifier is itself a model, and nothing is emailed yet — a real inbox is next." |

## Decisions (agent-built on request, 2026-10-10/11)

1. **Models extract, code decides.** The classifier returns `details` (subject, level, timezone, year); the
   `derive missing slots` rule table decides what's missing (`trial_booking`: subject + level; `scheduling`:
   subject). Model judgement was 2/6; extraction 24/24.
2. **Confidence is recorded, never routed on** (0.7–1.0 on everything; `intent_clear` was true on 24/24).
   "Vague" = `other` + no flags + nothing extracted.
3. **`route` Switch**, first match wins: ① any safety flag → escalate · ② `complaint_or_sensitive` → escalate ·
   ③ vague → clarify · ④ missing slots → clarify · ⑤ fallback → auto_send. Route escalations get no AI draft.
4. **Second gate:** the draft is a forced tool `write_reply` → `{reply, answerable, unanswered}`; not answerable
   ⇒ escalate (draft kept for the human). No tool call ⇒ not answerable.
5. **Clarify:** code picks what to ask; the model phrases it in the customer's language; code enforces one `?`.
6. **Claim checks:** regex for prices/%/times/dates (unverified deadlines flagged by name) + a code backstop for
   availability contradictions + a **verifier model** (`record_check`, temperature 0, quoted evidence, facts as
   plain lines). Any problem ⇒ `blocked`. Built test-first on 10 crafted replies (10/10, 9/10 on re-run).
7. **Facts need scope.** `trial.applies_to` and `booking` (how / channels / **scope**) were added after the
   drafter invented a GCSE-only trial, a website sign-up, and stretched "reply to this email" to lesson changes.
8. **Write first, enrich later.** `record received` saves the raw enquiry before any model call; a `failed` row
   can be reclaimed by a replay; anything else matching is a duplicate (200, no model calls).
9. **Failure path:** separate `01 Enquiry Desk - errors` workflow; alerts carry no customer data.
10. **Human review over the tailnet** (link buttons, not a public Funnel); POST-only actions, per-enquiry token,
    approve only when a draft exists; `approved_at` not `sent_at`.
11. **Chat ID stays out of git:** `{{ALERT_CHAT_ID}}` placeholder in exports, real value in `.env` (chosen over
    `$env`, which would expose every container secret to every workflow).
12. **Canvas: fan-out + join** (2026-10-12). Branches fan out from `route` to an action column and rejoin at
    `to record` (No Operation), so only 2 lines run back to the left (`facts` → ②, `to record` → ④). Chosen over a
    left-to-right staircase (~2× wider) and over Tidy Up (always left to right; tidy one row at a time).
13. **Dashboard numbers live in Postgres views** (2026-10-14), not in the chart tool: one definition for
    Grafana / React / README, versioned in `schema/`, and a dashboard user can be granted the views only (no
    customer data). Blocked runs log `validate`/`failed` in `run_log` — that's a block, not a system failure;
    `stats_health` excludes it.
14. **Nova only; compare models per stage** (2026-10-14): Anthropic on Bedrock isn't covered by the credit.
    See *Model strategy*.
15. **HTTP Request nodes, not n8n's AI nodes** (checked 2026-10-16/17). It began as the session-1 pattern, not a
    recorded choice; here is why it holds. The alternative is Basic LLM Chain + AWS Bedrock Chat Model +
    Structured Output Parser (not the AI Agent node: code decides, not the model).

    | Need | HTTP Request (now) | Basic LLM Chain + Bedrock Chat Model |
    |---|---|---|
    | Forced tool call (`toolChoice`) → guaranteed JSON shape | Yes | No setting for it (options: temperature, max tokens, top P, retries, timeout, guardrail, free-form extra fields). The parser prompts for JSON — *not verified in this version* |
    | Token counts → cost per enquiry in `run_log` | From the response `usage` | Output is text; no token counts found *(unverified)* |
    | Credentials | Bedrock API key (header auth) | AWS IAM keys or assumed role — the current key won't work |
    | Inference profile ID | Typed into the URL | Dropdown (listed, untested) |
    | Per-stage model comparison | Needs the `config` split | Natural (one model node per chain) |
    | Fewer nodes / less parsing | No (4 build + 4 read Code nodes) | Yes |

    **Kept HTTP:** every measured number (6/6 flags, 0 invented claims, ~$0.0018) is from this version, and a swap
    means re-measuring. `clarify` (plain text, no tool) is the only clean swap and isn't worth making one of four
    inconsistent. Optional experiment: build `clarify` as a chain in a scratch copy and compare. Answer for "why not
    the AI nodes?": forced tool calls for guaranteed structure, token usage for per-stage cost.

## Model strategy (decided 2026-10-14)

- **Nova models only** while the credit is the budget (rule: credits only). Claude is out until a client pays.
- **Develop and test on the cheapest model that works; step up to compare, then pick the best.** Cheap runs make
  iteration nearly free (~4¢ per full 24-case run).
- **Compare per stage, not just per run.** The four calls need different things: `classify` extracts (cheap model
  likely fine), `draft` writes grounded prose, `verify` judges claims (the call most likely to need a stronger
  model), `clarify` is one short question. Try a different model on each and keep the cheapest set that holds
  the safety numbers.
- **Decision rule:** a model set qualifies only if **safety flags stay 6/6, invented claims stay 0 and actions
  don't drop**; among those, lowest cost per enquiry wins. Judge on ≥2 runs — run-to-run variance is ±1–2/24.

**Needs building first** (not done): `config` holds one model/URL/price set that every call reads. Split it into
one entry per stage (`classify` / `draft` / `verify` / `clarify` → URL + model + prices); the four `read …`/`parse …`
nodes price each call from its own entry; `run_log.model` already records the model per stage. Add `--label` to
`score.py` so each results file names the model set, and a small compare script (one row per run: label, scores,
cost). **Check before trusting a small model:** every call relies on a *forced tool call* (`toolChoice`), and
Micro may not support it or may do it less reliably than Lite.

**Titan:** AWS confirms first-party models (Nova, Titan) are standard usage covered by the credit. But on this
account Titan is **embeddings only** (checked 2026-10-14 in ap-southeast-1, us-east-1, us-west-2: no Titan *text*
model is offered; the text models are retired). So it can't be one of the four calls. It would fit a future
"find similar past enquiries" / thread-matching feature (`amazon.titan-embed-text-v2:0`, us-east-1/us-west-2 only).

**Candidates:** Micro (cheapest) · Lite · Nova 2 Lite (current) · Pro (strongest, priciest). Prices:
bedrock pricing page for ap-southeast-1 — read it, don't guess.

## Node map

**Intake workflow** `01 Enquiry Desk - intake` (`9OtHm7FyRtNdUl1p`, 47 nodes incl. stickies)

| Stage | Nodes |
|---|---|
| ① Intake | `Webhook` → `normalise` → `valid email?` (no → `respond 400`) → `record received` → `envelope` → `duplicate?` (yes → `respond duplicate`) → `respond 202` → `config` → `facts` |
| ② Understand → route | `build classify request` → `classify` → `parse classification` → `derive missing slots` → `route` |
| ③ auto_send | `action = auto_send` → `select facts` → `build draft request` → `draft` → `read draft` → `answerable?` → (`build verify request` → `verify` → `read verify` → `validate claims` \| `action = escalate (gate 2)`) |
| ③ clarify | `action = clarify` → `build clarify request` → `clarify` → `read clarify` → `validate claims` |
| ③ escalate | `action = escalate` |
| ③ join | `validate claims`, `action = escalate (gate 2)`, `action = escalate` → `to record` (No Operation) |
| ④ Record → review | `prepare row` → `update enquiry` → `insert run_log` → `insert reply` → `needs review?` → `open review` → `notify a human?` → `review alert` |

**Errors** `01 Enquiry Desk - errors` (`BSmcb09mPBarqPjO`): `Error Trigger` → `read error` → `mark failed` → `build alert` → `log failure` → `telegram alert`
**Review** `01 Enquiry Desk - review` (`QQEDcUxU7OJIeNn3`): GET `review page` → `read query` → `load enquiry` → `render page` → `respond page` · POST `review action` → `read form` → `apply decision` → `render result` → `respond result`

Credentials (n8n only): `Bedrock - API key`, `Postgres account`, `Telegram - alerts bot`. Chat ID: `ALERT_CHAT_ID`
in `.env`. Settings: save successful production executions = all; intake's Error workflow = errors.
Canvas: four stacked stage frames (3620 px wide), fits one screen at **Shift+1**.

**Repo files:** `WORKFLOW.md` (node-by-node guide) · `workflows/01-intake.mine.json`, `01-errors.json`,
`01-review.json` (+ `IMPORT.md`) · `kb/facts.yaml` (source of truth — the `facts` node is a hand copy, **change
both**) · `schema/schema.sql` (tables, `dead_letter`, `stats_*` views) · `test/score.py`, `test/replay.py`,
`test/enquiries.jsonl`, `test/results/`.

**Dashboard views** (all read-only, no email/subject/body):

| View | Gives |
|---|---|
| `stats_enquiry` | One row per enquiry: day (HKT), status, category, action, flags?, review status, `is_test`, `cost_usd`, `model_calls` |
| `stats_daily` | Enquiries per day × status × action |
| `stats_cost` | Per day: processed count, total spend, average cost per processed enquiry |
| `stats_pending_reviews` | Pending reviews, oldest first, with `waiting` |
| `stats_block_reasons` | Why replies were blocked, bucketed (gate 2, invented price, verifier, …) |
| `stats_health` | One row: dead letter, stuck, pending reviews, failures in 24 h, last processed |

Snapshot 2026-10-14: 58 blocked replies = 45 gate 2 · 10 invented price · 3 verifier; 11 pending reviews; 2 stuck.

## Results history

| Run | Category | Flags | Slots | Actions | Invented | Cost | Notes |
|---|---|---|---|---|---|---|---|
| `20261010-221447` | 21/24 | 5/5 | 2/6 | — | — | $0.00094 | **Nova baseline** |
| `20261010-233801` | 22/24 | 6/6 | 6/6 | 19/24 | — | $0.00096 | Code-derived slots, category definitions, `route` Switch |
| `20261011-001555` | 22/24 | 6/6 | 6/6 | 23/24 | 0/14 | $0.00122 | Gate 2 + clarify + numeric validator |
| `20261011-010552` | 22/24 | 6/6 | 6/6 | 22/24 | 0/13 | $0.00123 | Write-first intake |
| `20261011-014710` | 22/24 | 6/6 | 6/6 | 21/24 | 0/12 | $0.00123 | After the chaos test (t01 fact gap found) |
| `20261011-015701` | 22/24 | 6/6 | 6/6 | 22/24 | 0/13 | $0.00123 | `trial.applies_to`; 400/202/200 responses |
| `20261011-021009` | 22/24 | 6/6 | 6/6 | 22/24* | 0/12 | $0.00172 | Verifier — **caught a real error** (GCSE Maths on Saturdays). *t22 relabelled |
| `20261011-024616` | 22/24 | 6/6 | 6/6 | 22/24 | 0/12 | $0.00176 | Booking fact + scope; t20 invented content blocked (in Chinese) |
| `20261011-030241` | 22/24 | 6/6 | 6/6 | **23/24** | 0/12 | $0.00176 | **Human review live**; only miss t06 (blocked) |

All runs: `test/results/<run>.jsonl`. Run-to-run variance at temperature 0 is ±1–2/24 — compare runs, not cases.

## Open issues

- ~~A7 credit check~~ resolved: Claude on Bedrock is Marketplace-billed, **not** covered by the credit. Nova only.
- **Why was the account put on hold (10-11)?** Lifted, cause not recorded. Read the AWS notice before relying on
  the account for the Loom or a pilot.
- **2 stuck rows** (`status = received`, executions 708 and 710 on 10-11): runs that died during the hold
  without being marked failed (manual runs; the Error Trigger is production-only), so they're **not** in
  `dead_letter` and `replay.py` won't see them. Mark them `failed` and replay, or delete them. `stats_health.stuck`
  will catch the next one.
- **Legacy rows:** 161 enquiries with `status = 'new'` (2026-10-06 → 10, before write-first intake). Kept;
  views show them, but they never count as processed.
- **Residual risk:** the verifier is a model (~1 in 10 variance on the crafted set); only availability has a code
  backstop. Re-run the crafted set (see *Things learned*) whenever prompts change. Cost +40% from the verifier.
- **Scoring is strict on purpose:** `blocked` ≠ `escalate` (t06 counts as a miss though both reach a human).
- **t15 / t23 categories** still wrong (past-paper bank, US admissions → course_content) — replies are correct.
- **Nothing is emailed.** A real inbox (Gmail/Outlook draft) is the next product step, ideally for a pilot.
- `score.py`: no error-type counts (503 / 429 / timeout); stale `--psql` docstring example.
- Repo: `workflows/01-intake.json` is the session-1 answer key; `test/test.json` is a scratch file.

## How to run things

```bash
set -a; source .env; set +a          # loads WEBHOOK_PROD_URL, ALERT_CHAT_ID
python3 test/score.py --webhook "$WEBHOOK_PROD_URL" \
  --psql "docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n"        # all 24, ~6 min, ~4¢
python3 test/replay.py --webhook "$WEBHOOK_PROD_URL" \
  --psql "docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n" --dry-run   # list the dead letters
```
Review page: `https://raspberrypi.tailf7a7bf.ts.net/webhook/review?id=…&t=…` (tailnet only).
**Export ritual:** close every n8n tab → open fresh → unpin → export → agent scans (re-placeholders the chat ID
in intake + errors) → commit **without** an attribution trailer.

## Things learned — don't relearn them

**n8n**
- **A stale editor tab overwrites API edits** — and gets published. Happened four times. Close every tab
  before an agent edit; never Save in an old tab.
- **"Active" is "Publish"** (n8n 2.x): Save edits the draft; production runs the published version.
- **Default webhook mode answers 200 before the workflow runs.** Use Respond to Webhook nodes; answer after
  the enquiry is saved (202 + id) and keep processing afterwards.
- **Bad input ≠ failure:** return 400 instead of throwing, or every typo pages you.
- **Postgres node:** replaces the item with its result (re-attach your data) · UPDATE/INSERT with 0 rows →
  `{success: true}` and the run continues · SELECT with 0 rows → **no items**, the next node never runs
  (*Always Output Data*) · comma-list `queryReplacement` splits values with commas → `={{ [ … ] }}` ·
  `{{ }}` in SQL is string pasting → always `$1..$n`.
- **`on conflict … do update … where <cond>`** returns a row only when it updates → reclaim vs duplicate.
- **Telegram node defaults to Markdown** — `_` breaks it. Use `parse_mode: HTML` and escape `& < >`.
- **Error Trigger** fires for production runs only; nothing alerts on a failure *inside* the error workflow.
- **Tests must not page humans** — gate notifications on test traffic.
- **Public API PUT rejects `settings.binaryMode`**; several incoming branches run a node once per branch (no Merge).
- **Line drawing is fixed by position** (checked in the 2.26 editor code): target to the right → curve
  (straight only at equal height); target to the left → stepped line, dropping 130 px and rising at target − 40 px,
  so **every** left-pointing line into the same node shares that route. Fix overlaps by moving nodes or adding a
  No Operation join. There's no per-line setting.
- **Tidy Up always lays out left to right** — select one row and Shift+Alt+T to tidy only that row.
- **Retry On Fail retries every error**, including ones that can't succeed (an account hold): 4 tries, then fail.

**Models**
- **Let models extract, let code decide** — extraction 24/24 vs judgement 2/6. Self-reported confidence and
  vague yes/no fields are useless; a yes/no tied to a concrete check ("did you have to say *I'll check*?") works.
- **Structured JSON on Bedrock = forced tool call.** Shape is enforced, correctness isn't.
- **Every fact needs a scope** — a model applies any process you give it to everything nearby.
- **A second model as verifier** (narrow job, temperature 0, must quote evidence) + **code backstops** for
  pattern-matchable claims. **Render facts as plain lines** — small models misread nested JSON.
- **Test a model step in isolation:** throwaway webhook workflow + crafted good/bad inputs; re-run it.

**AWS / infra**
- Credit covers **"Sold by: AWS"** only. **Confirmed:** Nova yes; Anthropic/Claude on Bedrock is billed separately
  through AWS Marketplace and does not consume the credit.
- **Callable Nova models** (ap-southeast-1, checked 2026-10-14): `apac.amazon.nova-micro-v1:0`,
  `apac.amazon.nova-lite-v1:0`, `apac.amazon.nova-pro-v1:0`, `global.amazon.nova-2-lite-v1:0`. Use the profile ID,
  not the bare model ID.
- Cross-region inference needs the **profile ID** (`global.amazon.nova-2-lite-v1:0`).
- **`Operation not allowed` (400) from Bedrock = the account is restricted**, not a request bug. Quick test:
  `aws bedrock-runtime converse --profile sandbox-26 --region ap-southeast-1 --model-id
  global.amazon.nova-2-lite-v1:0 --messages '[{"role":"user","content":[{"text":"Say OK"}]}]'`.
- Two CLI profiles on the Pi: `default` = `017820696925` (not this project); Bedrock + `$5` budget = `718339078322`.
- `set -a; source .env; set +a` loads `.env`. n8n is **tailnet-only** (Tailscale Serve, no Funnel).

## Later

- **Real inbox:** Gmail/Outlook in → reply saved as a draft in their inbox; approve → actually send (`sent_at`).
- **`llm-call` sub-workflow** (provider adapter) once there's a second provider; **Ollama** on the M5 as that branch.
- **LLM-as-judge** in `score.py` for `note_expected` cases; **follow-up** workflow for unanswered clarify replies.
- **Conversations (with the real inbox).** Detect follow-ups by email thread headers (`In-Reply-To` /
  `References`) first, a quoted reference id second, same sender within N days only as "possibly related".
  `conversation_id` + `parent_enquiry_id` on `enquiry` (don't reuse the `followup` table name — that's scheduled
  messages). **Rule: a thread with an open review or escalation never gets an auto-reply.** Models are
  stateless: send the last 2–3 messages + a stored summary in `<history>` (data, never instructions, never a
  source of facts), to the classifier as well as the drafter.
- **Facts in a Google Sheet** when a client must edit them; grow the test set with real (anonymised) enquiries.

## Positioning (for applications and pitches)

**Strong as proof of capability, weak as a product.** Enquiry triage is crowded; what stands out is
*reliability you can show numbers for*. Lead with the outcome ("Asian-timezone enquiries wait 7 hours; this
answers the safe majority in minutes and routes the rest to a person by morning"), then show the safety
mechanisms and the measured results. Be explicit that the client is fictional and the data synthetic.
