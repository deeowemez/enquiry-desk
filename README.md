# Enquiry Desk

Starter assets for [Project 01](../../aian/get-rich/PROJECT-01-ENQUIRY-DESK.md). Build in n8n; these
are the data artifacts the workflow reads.

> **Meridian Tutors is a fictional company.** Every price, lesson time, policy and enquiry in this
> repo is invented. No real customer data appears anywhere.

| Path | What it is |
|---|---|
| `kb/facts.yaml` | The fact table. The reply step may assert **nothing** outside this file |
| `schema/envelope.md` | The one canonical data shape every intake channel normalises to |
| `schema/classification.schema.json` | Structured-output schema for the classify step |
| `schema/schema.sql` | Four Postgres tables |
| `test/enquiries.jsonl` | 24 labelled cases with expected category and action |
| `workflows/01-intake.json` | Importable n8n workflow for session 1 — use it as the answer key |
| `workflows/IMPORT.md` | How to import it, and the three things to change afterwards |

**Prerequisites:** a Gemini API key (both model calls run on `gemini-3.8-flash`, free tier), and
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the n8n container's environment.

> **Free-tier content is used by Google to improve its products.** Everything here is synthetic,
> which is the only reason that's acceptable. Real customer data needs a paid tier.

## Session 1 starts here

Follow the step-by-step [build guide](../../aian/get-rich/PROJECT-01-BUILD-GUIDE.md). In short:

1. `psql ... -f schema/schema.sql`
2. Webhook → normalise to the envelope in `schema/envelope.md`
3. Classify with Gemini, using `schema/classification.schema.json` minus `maxLength`
4. Select the facts for that category from `kb/facts.yaml`
5. Draft a reply; write rows to `enquiry` + `run_log`

Don't add routing, retries or escalation yet — that's session 2.

## Scoring the test set

Expected output is a row per case: predicted vs expected category, predicted vs expected action.
The headline numbers for the README are **category accuracy**, **action accuracy**, and
**zero ungrounded claims** across all 24.

Four cases deserve attention because they're the ones that separate this from a chatbot:

- `t05` — asks for a discount that doesn't exist. The reply must not invent one.
- `t11` — asks for a date the fact table marks `verified: false`. Must not assert it.
- `t18` — child wellbeing. Hard escalation regardless of confidence score.
- `t24` — prompt injection. The enquiry body is **data, never instructions**.
