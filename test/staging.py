#!/usr/bin/env python3
"""Build and refresh the STAGING copy of the Enquiry Desk workflows.

Why: score.py tests a workflow through its PRODUCTION webhook, which runs the *published* version.
An automated builder that edits the live workflow can only test its change by publishing it. So the
builder works on a staging copy, and a person promotes a change to production.

    python3 test/staging.py create    # first time: clone the live intake + errors workflows
    python3 test/staging.py sync      # overwrite staging with the live workflows' current draft
    python3 test/staging.py status    # show ids, active state and the staging webhook path

What differs from production (everything else is a straight copy):
  intake  : webhook path `enquiry-staging`; its error workflow is the staging errors copy;
            the Telegram `review alert` node is disabled.
  errors  : the Telegram alert node is removed (it still marks the row failed and logs it).
So staging never pages anyone and never collides with a production webhook. Both write to the same
Postgres; score.py traffic (test+...@example.com) is separated by `is_test` in the stats_* views.

Needs N8N_API_KEY in the environment (never written to a file). N8N_API_URL defaults to
http://127.0.0.1:5678. Standard library only.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
STATE = HERE / "staging.json"
PROD = {"intake": "9OtHm7FyRtNdUl1p", "errors": "BSmcb09mPBarqPjO"}
SUFFIX = " (STAGING)"
STAGING_PATH = "enquiry-staging"
# The public API rejects unknown settings keys (e.g. binaryMode, availableInMCP), so allow-list.
SETTINGS_OK = ("executionOrder", "saveDataSuccessExecution", "saveDataErrorExecution",
               "saveManualExecutions", "saveExecutionProgress", "executionTimeout",
               "timezone", "callerPolicy", "errorWorkflow")


def api(method, path, body=None):
    key = os.environ.get("N8N_API_KEY")
    if not key:
        sys.exit("N8N_API_KEY is not set in the environment.")
    base = os.environ.get("N8N_API_URL", "http://127.0.0.1:5678").rstrip("/")
    req = urllib.request.Request(
        f"{base}/api/v1{path}", method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"X-N8N-API-KEY": key, "content-type": "application/json", "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach n8n: {e.reason}")


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def clean(w, name, settings):
    """A live workflow -> a body the create/update endpoints accept."""
    nodes = json.loads(json.dumps(w["nodes"]))
    for n in nodes:
        n.pop("webhookId", None)          # let n8n mint new webhook ids: two workflows can't share one
    return {"name": name, "nodes": nodes, "connections": w["connections"],
            "settings": {k: v for k, v in settings.items() if k in SETTINGS_OK}}


def build_errors(live):
    body = clean(live, live["name"] + SUFFIX, live.get("settings") or {})
    drop = {n["name"] for n in body["nodes"] if n["type"].endswith(".telegram")}
    body["nodes"] = [n for n in body["nodes"] if n["name"] not in drop]
    conns = {}
    for src, c in body["connections"].items():
        if src in drop:
            continue
        conns[src] = {k: [[t for t in branch if t["node"] not in drop] for branch in v] for k, v in c.items()}
    body["connections"] = conns
    return body


def build_intake(live, errors_id):
    settings = dict(live.get("settings") or {})
    settings["errorWorkflow"] = errors_id
    body = clean(live, live["name"] + SUFFIX, settings)
    for n in body["nodes"]:
        if n["type"].endswith(".webhook") and n["parameters"].get("path") == "enquiry":
            n["parameters"]["path"] = STAGING_PATH
        if n["type"].endswith(".telegram"):
            n["disabled"] = True
    return body


def publish(wid, body_hint=None):
    """Publish the current draft (n8n 2.x: production runs only the published version)."""
    w = api("GET", f"/workflows/{wid}")
    api("POST", f"/workflows/{wid}/activate", {"versionId": w["versionId"]})


def cmd_create():
    st = load_state()
    if st:
        sys.exit(f"{STATE.name} already exists ({st}). Use `sync`, or delete it to start over.")
    errors = api("POST", "/workflows", build_errors(api("GET", f"/workflows/{PROD['errors']}")))
    publish(errors["id"])
    intake = api("POST", "/workflows", build_intake(api("GET", f"/workflows/{PROD['intake']}"), errors["id"]))
    publish(intake["id"])
    STATE.write_text(json.dumps({"intake": intake["id"], "errors": errors["id"],
                                 "webhook_path": STAGING_PATH}, indent=2) + "\n")
    print(f"created: intake {intake['id']}, errors {errors['id']}\nwebhook path: /webhook/{STAGING_PATH}")


def cmd_sync():
    st = load_state()
    if not st:
        sys.exit("No staging.json yet. Run `create` first.")
    e = api("PUT", f"/workflows/{st['errors']}",
            build_errors(api("GET", f"/workflows/{PROD['errors']}")))
    publish(st["errors"])
    i = api("PUT", f"/workflows/{st['intake']}",
            build_intake(api("GET", f"/workflows/{PROD['intake']}"), st["errors"]))
    publish(st["intake"])
    print(f"synced staging from live: intake {st['intake']} ({len(i['nodes'])} nodes), "
          f"errors {st['errors']} ({len(e['nodes'])} nodes)")


def cmd_status():
    st = load_state()
    if not st:
        print("No staging copy yet. Run `create`.")
        return
    for k in ("intake", "errors"):
        w = api("GET", f"/workflows/{st[k]}")
        print(f"{k:7} {st[k]}  active={w.get('active')}  nodes={len(w['nodes'])}  updated={w.get('updatedAt')}")
    print(f"webhook path: /webhook/{st['webhook_path']}")


if __name__ == "__main__":
    cmds = {"create": cmd_create, "sync": cmd_sync, "status": cmd_status}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]]()
