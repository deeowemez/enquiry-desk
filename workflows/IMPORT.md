# Importing the workflows

Three workflows make up the system. Import them in this order, because the first two are referenced by the third. A fourth,
the optional Gmail adapter (`01-gmail.json`, see *Email in* below), feeds email into the intake:

| File | Workflow | Role |
|---|---|---|
| `01-errors.json` | `01 Enquiry Desk - errors` | Failure path: marks the row `failed`, logs it, sends a Telegram alert |
| `01-review.json` | `01 Enquiry Desk - review` | The human review page, and the Gmail draft on approve |
| `01-intake.mine.json` | `01 Enquiry Desk` (intake) | The pipeline: webhook → classify → route → draft or clarify → verify → record → Gmail draft or review |

`01-intake.staging.json` and `01-review.staging.json` are exports of the **staging copies** (see the last section).
You don't need them to run the system.

## Before you import

1. **Postgres.** Use a database of its own (this project uses `enquiry`, and `enquiry_staging` for staging), not the one n8n
   keeps its own data in. Create the tables and views, then the fact table and its first version:
   ```bash
   psql -h <host> -U <user> -d <db> -f ../schema/schema.sql
   psql -h <host> -U <user> -d <db> -f ../schema/facts.sql
   node ../console/scripts/seed-facts.mjs | psql -h <host> -U <user> -d <db>    # version 1, from kb/facts.json
   ```
   Without a live fact set every enquiry fails at `facts` ("No live fact set"), loudly, through the errors workflow.
2. **n8n environment.** The `normalise` node uses Node's `crypto`, which n8n blocks by default. Add this to the
   container's `environment:` and restart:
   ```yaml
   - NODE_FUNCTION_ALLOW_BUILTIN=crypto
   ```
   Without it, `normalise` fails with `Module 'crypto' is disallowed`.
3. **Credentials.** Create these in n8n (Credentials → New). Names matter only for your own sanity; you will pick
   them from dropdowns after import.

   | Credential | Type | Used by |
   |---|---|---|
   | `Bedrock - API key` | Header Auth: name `Authorization`, value `Bearer <your Bedrock API key>` | `classify`, `draft`, `verify`, `clarify` |
   | `Postgres account` | Postgres. **If n8n runs in Docker the host is not `localhost`**: use the Postgres service name from your compose file or `host.docker.internal` | every Postgres node |
   | `Telegram - alerts bot` | Telegram API (bot token from @BotFather → `/newbot`; open the bot and press *Start*) | `telegram alert`, `review alert` |
   | `Gmail - drafts` | Gmail OAuth2 API (below) | `create gmail draft` (review **and** intake) |

   **Gmail OAuth2.** In Google Cloud, create a project, enable the **Gmail API**, configure the consent screen
   (External; add your mailbox as a test user, and publish the app so the refresh token does not expire after 7
   days), then create an **OAuth client ID** of type *Web application* whose redirect URI is
   `https://<your-n8n>/rest/oauth2-credential/callback`. Paste its client ID and secret into n8n and click
   **Sign in with Google**. Use a **dedicated mailbox**, not a personal one, because the credential's scopes are
   broad. The workflow only ever creates drafts; it has no send node.

   Models are Amazon Nova on Bedrock (`ap-southeast-1`). Bedrock needs access to the Nova models in your account.

> **Synthetic data only** until you have confirmed Bedrock's data terms for your use. Never put real customer data
> through this project as it stands.

## Import

n8n → **Overview** → **Create Workflow** → top-right **⋯** → **Import from File…**, once per file. Imported nodes
show a red warning triangle until a credential is attached. Open each such node and pick the credential from the
dropdown.

### 1. `01-errors.json`

1. Attach `Postgres account` to `mark failed` and `log failure`, and `Telegram - alerts bot` to `telegram alert`.
2. **Chat ID.** The committed file has the placeholder `{{ALERT_CHAT_ID}}` in `telegram alert` → *Chat ID*. Replace it
   with your numeric chat ID (ask **@userinfobot**). Keep the real value out of any file you commit; this repo's
   `.env` (gitignored) holds it as `ALERT_CHAT_ID`.
3. **Publish** the workflow.

### 2. `01-review.json`

1. Attach `Postgres account` to `load enquiry`, `apply decision` and `record draft`, and `Gmail - drafts` to
   `create gmail draft`.
2. **Publish** it. It serves two endpoints:
   - `GET /webhook/review?id=…&t=…`: the read-only page. A row matches only when the id **and** the token agree.
   - `POST /webhook/review-act`: the page's *Approve* and *Take over* buttons.
3. **What approve does.** It sets `approved_at`, then `draft needed?` lets an approved reply through to
   `create gmail draft`, which writes `Re: <subject>` addressed to the customer into the mailbox's **Drafts**
   folder. `record draft` stores `drafted_at` and `gmail_draft_id`, or `draft_error` if Gmail failed. A Gmail
   failure never undoes the approval. **Nothing is ever sent automatically**: a person opens the draft and presses
   Send, and `sent_at` stays empty.
4. **Reachability.** The page is meant for a private network such as your **tailnet** (Tailscale Serve, not
   Funnel). The phone needs the Tailscale app connected. Telegram never fetches the link, so nothing needs to be
   public.

### 3. `01-intake.mine.json`

1. Attach `Bedrock - API key` to `classify`, `draft`, `verify` and `clarify`, `Postgres account` to `record received`,
   `load facts`, `record results`, `open review` and `record draft`, `Gmail - drafts` to `create gmail draft`,
   and `Telegram - alerts bot` to `review alert`. In `review alert`, replace the `{{ALERT_CHAT_ID}}` placeholder.
2. **`config` node.** Set `review_base_url` to `https://<your-n8n>/webhook/review`. The same node holds the model
   for each stage and the price table used for cost figures. Change a stage's model there, and add its prices to
   `model_prices`.
3. **Error workflow.** Intake → **Settings** → **Error workflow** → `01 Enquiry Desk - errors` → Save.
4. **Publish.** n8n 2.x has *Publish* instead of an Active toggle: saving changes only the draft, and the production
   webhook serves the **published** version.
5. **Facts.** They are not in the workflow: `load facts` reads the live version from the `fact_set` table. Change them in the
   staff console (`../console/README.md`), which tests a change on staging before it can be published.

## First run

```bash
curl -X POST 'https://<your-n8n>/webhook/enquiry' \
  -H 'content-type: application/json' \
  -d '{"email":"parent@example.com","subject":"A-Level Biology","message":"How much is Biology A-Level per month?"}'
```

You should get `202` with a reference id within about half a second, and a row in `enquiry` with `status =
'processed'` a few seconds later. A missing or invalid `email` returns `400`, and a repeat of the same enquiry on the
same day returns `200` with `duplicate`. To exercise the failure path, POST something that fails in `normalise`
(for example a broken body) and watch for the Telegram alert. Use the production webhook, not *Execute workflow*:
the Error Trigger fires for production runs only.

To score the 24 labelled cases, see `python3 test/score.py --help`.

## If a node looks broken after import

Node parameter shapes change between n8n versions. If a node shows "unknown node type" or opens with empty or wrong
fields, its `typeVersion` does not match your n8n. These exports were built on **n8n 2.26.8**. The fix is to delete
that node, add a fresh one of the same type, copy the parameters across from the export, and reconnect it. The
Postgres nodes are the most likely: the query-parameter field is `options.queryReplacement`, and its expression
list must match `$1..$n` in the query.

## Staging copies (optional)

`test/staging.py` builds copies of the intake, errors and review workflows with their own webhooks
(`/webhook/enquiry-staging`, `/webhook/review-staging`, `/webhook/review-act-staging`) and no Telegram. Changes are
scored there, and only a person promotes them to the live workflow:

```bash
export N8N_API_KEY=…                    # never written to a file
python3 test/staging.py status
python3 test/staging.py promote         # read-only plan; add --yes to apply (backs up live first)
python3 test/staging.py rollback --yes  # undo the last promotion
```

**Email in:** `workflows/01-gmail.json` is the production Gmail adapter (`Gmail Trigger` → `email filter` → `to intake`), and
`01-gmail.staging.json` its staging copy. Each needs the Gmail credential (default scopes, which include reading), the two columns
`gmail_message_id` and `gmail_thread_id` from `schema/schema.sql` in its database, and its *Error workflow* set to that environment's
errors workflow. Production takes every Primary email except `<mailbox>+staging@…`; staging takes only those. With `staging.py`,
`create-gmail-live --yes` builds the production adapter from the staging one (inactive; switch it on in n8n). Use a mailbox that
gets only test mail: every email in it is sent to the model.

`promote review` and `rollback review` do the same for the review workflow. Live webhook paths, ids, Telegram state,
the review link and the live database credential are preserved on promotion.

**Give staging its own database** (recommended, so staging runs never touch production rows):

```bash
docker exec -i <postgres> psql -U <user> -d postgres -c "create database enquiry_staging owner <user>;"
docker exec -i <postgres> psql -U <user> -d enquiry_staging < schema/schema.sql
```

Then create a second Postgres credential in n8n, `Postgres - staging` (same host and user, database `enquiry_staging`), add
its id and name to `test/staging.json` as `"postgres_credential": {"id": "…", "name": "Postgres - staging"}`, and run
`python3 test/staging.py use-db`. Point `score.py --psql` at that database when you score staging. Apply every later schema
change to both databases.
