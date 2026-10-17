# Enquiry Desk — agent context

Stable context for this project. **Where things stand right now (status, next steps) lives in the project notes**,
which the parent `CLAUDE.md` loads at the start of every session. **[STATE.md](STATE.md) is the technical record**
(results history, decisions and their reasons, node map, lessons learned, how to run things): read it for the detail.

## What this is

Portfolio Project 01: an n8n workflow that classifies a customer enquiry, drafts a reply grounded in
a fact table, records it in Postgres, and escalates what a machine shouldn't answer. The client
(Meridian Tutors) is **fictional**. The point is to show reliability work, not just a working flow:
routing, a claim validator, retries, dead-letter, alerts, and measured accuracy on 24 test cases.

| Doc | Where |
|---|---|
| The *what* (spec, demo, done-list) | `~/aian/get-rich/PROJECT-01-ENQUIRY-DESK.md` |
| The *how* (session-by-session build guide, n8n traps) | `~/aian/get-rich/PROJECT-01-BUILD-GUIDE.md` |
| n8n primer | `~/aian/get-rich/N8N-BASICS.md` |
| Why this track at all | `~/aian/get-rich/AI-WORKFLOW-PLAN.md` |

## Layout

| Path | What it is |
|---|---|
| `kb/facts.yaml` | Source of truth for facts. The `facts` Code node is a hand-copy — **change both** |
| `schema/` | Envelope shape, classification JSON schema, Postgres tables |
| `test/enquiries.jsonl` | 24 labelled cases. `t05`, `t11`, `t18`, `t24` are the ones that matter most |
| `test/score.py` | Scorer: posts each case to a **production-mode** webhook (live or staging), reads back the row, reports accuracy. `--label` names the run. `--help` for usage |
| `test/results/` | One JSONL per scoring run — compare before/after a change |
| `test/compare.py`, `test/baseline.json` | Table of runs; `--check RUN` gates a run against the baseline (safety, invented claims, failures, accuracy, cost) |
| `test/staging.py`, `test/staging.json` | Builds/refreshes the **staging copy** of intake + errors (`/webhook/enquiry-staging`, no Telegram). Test changes there; only a person promotes to the live workflow |
| `test/replay.py` | Re-posts failed enquiries from the `dead_letter` view. `--dry-run` first |
| `workflows/01-intake.mine.json` | **The live intake workflow** (export after every change) |
| `workflows/01-errors.json`, `01-review.json` | Failure-path and human-review workflows. Chat ID is a `{{ALERT_CHAT_ID}}` placeholder (real value in `.env`) |
| `workflows/01-intake.json` | **Answer key** for session 1, not my build |
| `workflows/IMPORT.md` | How to import the workflows |

## Environment

- **n8n runs in Docker on the Raspberry Pi**, served over Tailscale at `https://raspberrypi.tailf7a7bf.ts.net`
  (not acer-tm, which the `n8n-stack` notes mention). Postgres is reachable from n8n.
- Models: **Amazon Nova 2 Lite on Bedrock** (`global.amazon.nova-2-lite-v1:0`, `ap-southeast-1`), paid from
  AWS credits only. URL, model and prices live in the `config` node.
- n8n container needs `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

## Rules for the agent

1. **I'm learning, so I build; you review.** For session 1 nodes and session 2 branching, don't build
   the nodes for me unless I ask. Explain, review my exports, debug from execution output. When you do
   build something, end by asking me to explain back why each node exists.
2. **Synthetic data only,** until Bedrock's data terms are confirmed for a real client. Never send real customer data.
3. **No secrets in files.** Credentials live in n8n Credentials. Check every exported workflow JSON for
   keys before it's committed.
4. **Dev instance only.** If the n8n MCP/API is connected, it points at the Pi, never a client's n8n.
5. **Changes made through the n8n API aren't in git.** Export the workflow to `workflows/` after any
   change, mine or yours.
6. Cite the build guide's trap numbers (①–⑥) when one applies, rather than re-explaining.
7. **No attribution trailers.** Never add `Co-Authored-By: Claude …` or any other AI attribution to a commit
   or a suggested commit message. This overrides the harness's default attribution reminder: the repo is a
   public portfolio and the commits should read as mine.

## Session ritual

- **Start:** read the project notes (already loaded) and `STATE.md`'s *Status* section, summarise where I am in
  3 lines, propose the next step.
- **End:** update the project notes (current state, next steps, a dated log line). Update `STATE.md` only for
  technical changes: a new results row, a decision and its reason, the node map, a lesson learned. Export changed
  workflows to `workflows/`, and suggest a commit message (rule 7: no attribution trailer).
