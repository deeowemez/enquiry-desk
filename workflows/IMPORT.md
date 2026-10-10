# Importing `01-intake.json`

## Prerequisite

The `normalise` node uses Node's `crypto` module, which n8n blocks by default. Your n8n container
needs this in its `environment:` — then `docker compose up -d`:

```yaml
- NODE_FUNCTION_ALLOW_BUILTIN=crypto
```

Without it, `normalise` fails with `Module 'crypto' is disallowed`.

## How to import

n8n → **Overview** → **Create Workflow** → top-right **⋯** menu → **Import from File…**
(or **Import from URL**). Pick `01-intake.json`. Save.

You should see 11 nodes in one line, surrounded by **6 sticky notes**. Two nodes will show a red
warning triangle — that's expected, it's the missing credentials.

**Read the canvas before you touch anything.** The big grey note above the flow explains what the
whole thing does and the one design decision worth defending; the blue notes label the four stages;
the red note at the bottom lists what session 1 deliberately leaves out. Every node also carries a
one-line description underneath it on the canvas (`notesInFlow`), so you can read the whole flow
without opening a single node.

If you'd rather not see the per-node captions, open a node → **Settings** → untick
**Display note in flow**.

---

## What you MUST change — 3 things

### 1. One Gemini credential (nodes `classify` and `draft`)

Both model calls run on **Gemini 3.8 Flash, free tier**. One credential, used twice.

1. Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Open **`classify`** → **Credential for Header Auth** → **Create new credential**
3. **Name:** `x-goog-api-key` · **Value:** your Gemini key
4. Save it as `Gemini - x-goog-api-key`
5. Open **`draft`** and pick the *same* credential from the dropdown — don't create a second one

> **Free-tier data terms:** Google states that free-tier content is **used to improve its
> products**. That's fine here because every enquiry is synthetic. **Never put real client or
> customer data through the free tier.** For paid client work, use the paid tier, where content
> is not used.

### 2. The Postgres credential (node `insert enquiry`)

1. Run the schema first:
   `psql -h <host> -U <user> -d <db> -f ../schema/schema.sql`
2. Open **`insert enquiry`** → **Create new credential**
3. Host, Port `5432`, Database, User, Password
4. **If n8n runs in Docker, the host is NOT `localhost`** — use `host.docker.internal`, or the
   Postgres service name from your compose file

### 3. Get the webhook URL

Open **`Webhook`** → copy the **Test URL**. The Production URL only works once the workflow is
**Activated**, which you don't need yet.

---

## First run

```bash
curl -X POST '<your Test URL>' \
  -H 'content-type: application/json' \
  -d '{"email":"parent@example.com","subject":"A-Level Biology","message":"How much is Biology A-Level per month?"}'
```

1. Open `Webhook`, click **Listen for test event**
2. Send the curl above
3. **Pin** the Webhook output so you never send it again
4. Then work left to right: open each node, **Test step**, read the OUTPUT panel

Expected end state: one row in `enquiry`, and a sensible reply visible in `prepare row`'s output
under `draft_reply`.

---

## If a node looks broken after import

Node parameter shapes change between n8n versions. If a node shows *"unknown node type"*, or opens
with empty/wrong fields, the `typeVersion` in this file doesn't match your n8n.

**The fix is always the same:** delete that node, add a fresh one of the same type, copy the
parameters across from [PROJECT-01-BUILD-GUIDE.md](../../../aian/get-rich/PROJECT-01-BUILD-GUIDE.md),
and reconnect it.

Versions I built against:

| Node | type | typeVersion |
|---|---|---|
| Webhook | `n8n-nodes-base.webhook` | 2 |
| Code ×6 | `n8n-nodes-base.code` | 2 |
| HTTP Request ×2 | `n8n-nodes-base.httpRequest` | 4.2 |
| Postgres | `n8n-nodes-base.postgres` | 2.5 |

**`insert enquiry` is the one most likely to need rebuilding.** The Postgres node's query-parameter
field has moved between versions; here it's `options.queryReplacement`. If your version shows it
elsewhere, put the same comma-separated expression list into whatever the field is called — order
must match `$1..$12` in the query.

---

## Worth changing once it runs

| Where | Why |
|---|---|
| `facts` node | It's a hand-copy of `../kb/facts.yaml`. **They will drift.** Edit the node, not just the YAML |
| `build classify request` | Confidence threshold and categories live here, in `SCHEMA` |
| `parse classification` | `IN=0, OUT=0` for Gemini free tier. Moving to paid: `0.75` / `3.75` per MTok (through 2026-12-31). If the summary says `PARSE FAILED`, it lists the real response keys — fix `extractText` to match |
| `prepare row` | `IN=0, OUT=0` for the free tier; same paid rates as above. Its `extractText` must stay identical to the one in `parse classification` |
| `select facts` | `deadlines` filters on `verified` — that's what makes test case `t11` behave |

---

## What this does NOT include

Session 1 only. Deliberately absent:

- **No routing** — every enquiry takes the same path. No escalation gate, no clarify branch. So
  right now a complaint gets a cheerful auto-draft, which is exactly the problem session 2 fixes
- **No validator** — nothing yet stops an invented price reaching the draft
- **No retries, no dead-letter, no alerts** — session 3
- **No sending** — the reply is drafted and stored, never emailed. Keep it that way until the
  escalation gate exists
- **No email intake** — webhook only

Build sessions 2 and 3 by hand following the guide. The branching logic is where the learning is,
and hand-written Switch nodes are much less error-prone than imported ones.

---

# Importing `01-errors.json` (the failure path, session 3)

The intake workflow writes every enquiry to Postgres first (`record received`). If a production run
then fails, this workflow marks the row `failed` (the `dead_letter` view), logs it in `run_log` and
sends a Telegram alert with **no customer data** in it.

1. **Import** `01-errors.json` the same way as above.
2. **Credentials:** `mark failed` and `log failure` use your Postgres credential; `telegram alert` needs
   a **Telegram API** credential (bot token from @BotFather → `/newbot`). Open the bot and press *Start*.
3. **Chat ID:** the committed file has the placeholder `{{ALERT_CHAT_ID}}` in `telegram alert` →
   *Chat ID*. Replace it with your numeric chat ID (ask **@userinfobot**). The real value lives in this
   repo's `.env` as `ALERT_CHAT_ID` (gitignored) — keep it out of committed files.
4. **Publish** this workflow, then open the intake workflow → **Settings** → **Error workflow** →
   `01 Enquiry Desk - errors` → Save → Publish.
5. **Test through the webhook**, not *Execute workflow* — the Error Trigger only fires for production
   runs. A POST with no `email` field fails in `normalise` and should produce an alert within seconds.

The `dead_letter` view comes from `schema/schema.sql`.
