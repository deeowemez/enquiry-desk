#!/usr/bin/env python3
"""Build and refresh the STAGING copy of the Enquiry Desk workflows.

Why: score.py tests a workflow through its PRODUCTION webhook, which runs the *published* version.
An automated builder that edits the live workflow can only test its change by publishing it. So the
builder works on a staging copy, and a person promotes a change to production.

    python3 test/staging.py create    # first time: clone the live intake + errors workflows
    python3 test/staging.py sync --yes   # overwrite staging with the live workflows' current draft (discards
                                         # un-promoted staging work: `export` first)
    python3 test/staging.py status    # show ids, active state and the staging webhook path
    python3 test/staging.py export    # write the staging intake to workflows/01-intake.staging.json (chat id placeholdered)
    python3 test/staging.py models    # which model each stage uses on staging
    python3 test/staging.py set-model classify=apac.amazon.nova-micro-v1:0 [draft=... verify=... clarify=... | all=...]
    python3 test/staging.py promote        # SHOW what would change in the LIVE intake workflow (read-only)
    python3 test/staging.py promote --yes  # a PERSON runs this: back up live, apply staging's graph, publish
                                           # (refuses during a sweep, or when staging holds a non-default model: --allow-models)
    python3 test/staging.py rollback --yes # put the latest pre-promotion backup back and publish it

What differs from production (everything else is a straight copy):
  intake  : webhook path `enquiry-staging`; its error workflow is the staging errors copy;
            the Telegram `review alert` node is disabled.
  errors  : the Telegram alert node is removed (it still marks the row failed and logs it).
So staging never pages anyone and never collides with a production webhook. Both write to the same
Postgres; score.py traffic (test+...@example.com) is separated by `is_test` in the stats_* views.

Needs N8N_API_KEY in the environment (never written to a file). N8N_API_URL defaults to
http://127.0.0.1:5678. Standard library only.
"""
import datetime
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
BACKUPS = pathlib.Path.home() / ".local" / "state" / "enquiry-desk"   # pre-promotion copies: hold the real chat id, so NOT in git
STAGES = ("classify", "draft", "verify", "clarify")
DEFAULT_MODEL = "global.amazon.nova-2-lite-v1:0"     # what production runs on every stage unless a person decides otherwise
SWEEP_LOCK = BACKUPS / "sweep.lock"      # written by test/sweep.py while an experiment owns staging
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


def cmd_create(args):
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


def cmd_sync(args):
    st = load_state()
    if not st:
        sys.exit("No staging.json yet. Run `create` first.")
    refuse_during_sweep("sync")
    if "--yes" not in args:
        sys.exit("`sync` OVERWRITES staging with the live workflows, discarding any change that has not been promoted.\n"
                 "Run `export` first if staging holds work you want to keep, then `sync --yes`.")
    e = api("PUT", f"/workflows/{st['errors']}",
            build_errors(api("GET", f"/workflows/{PROD['errors']}")))
    publish(st["errors"])
    i = api("PUT", f"/workflows/{st['intake']}",
            build_intake(api("GET", f"/workflows/{PROD['intake']}"), st["errors"]))
    publish(st["intake"])
    print(f"synced staging from live: intake {st['intake']} ({len(i['nodes'])} nodes), "
          f"errors {st['errors']} ({len(e['nodes'])} nodes)")


def cmd_export(args):
    """Write the staging intake workflow to workflows/ (the repo rule: API changes must reach git).

    The Telegram chat id is replaced by the {{ALERT_CHAT_ID}} placeholder; the real value stays in .env.
    This is also how a change gets promoted: a person imports this file into the live workflow, then runs `sync`.
    """
    st = load_state()
    if not st:
        sys.exit("No staging.json yet. Run `create` first.")
    w = api("GET", f"/workflows/{st['intake']}")
    for n in w["nodes"]:
        if n["type"].endswith(".telegram") and "chatId" in n["parameters"]:
            n["parameters"]["chatId"] = "{{ALERT_CHAT_ID}}"
    out = {k: w[k] for k in ("name", "nodes", "pinData", "connections", "settings", "meta") if k in w}
    path = HERE.parent / "workflows" / "01-intake.staging.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(HERE.parent)} ({len(w['nodes'])} nodes)")


def sweep_running():
    """The lock info if a sweep (test/sweep.py) is alive and owns staging, else None. A dead pid means a stale lock."""
    try:
        info = json.loads(SWEEP_LOCK.read_text())
        os.kill(info["pid"], 0)
        return info
    except (OSError, ValueError, KeyError, TypeError):
        return None


def refuse_during_sweep(what):
    info = sweep_running()
    if info and os.environ.get("ENQUIRY_SWEEP") != "1":
        sys.exit(f"A sweep is running (pid {info['pid']}, started {info.get('started')}); `{what}` would change staging under it.\n"
                 "Use `python3 test/sweep.py status`, or `python3 test/sweep.py stop` first.")


def put(wid, body):
    """Update a workflow with a body the public API accepts (settings allow-listed)."""
    api("PUT", f"/workflows/{wid}", {"name": body["name"], "nodes": body["nodes"], "connections": body["connections"],
                                    "settings": {k: v for k, v in (body.get("settings") or {}).items() if k in SETTINGS_OK}})


def stage_models(w):
    cfg = next(n for n in w["nodes"] if n["name"] == "config")["parameters"]["assignments"]["assignments"]
    return {a["name"]: a["value"] for a in cfg}


def cmd_models(args):
    st = load_state()
    if not st:
        sys.exit("No staging.json yet. Run `create` first.")
    m = stage_models(api("GET", f"/workflows/{st['intake']}"))
    for s in STAGES:
        print(f"{s:9} {m.get(s + '_model', '(not set: the per-stage config has not reached staging)')}")
    print("priced models:", ", ".join(json.loads(m.get("model_prices", "{}"))))


def cmd_set_model(args):
    """Change which model a staging stage uses. Only models in config.model_prices are accepted."""
    st = load_state()
    if not st or not args:
        sys.exit("usage: set-model classify=<model id> [draft=... verify=... clarify=... | all=...]")
    refuse_during_sweep("set-model")
    w = api("GET", f"/workflows/{st['intake']}")
    cfg = next(n for n in w["nodes"] if n["name"] == "config")["parameters"]["assignments"]["assignments"]
    prices = json.loads(next(a["value"] for a in cfg if a["name"] == "model_prices"))
    want = {}
    for a in args:
        stage, _, model = a.partition("=")
        if stage != "all" and stage not in STAGES or not model:
            sys.exit(f"bad argument {a!r}: stages are {', '.join(STAGES)} or all")
        if model not in prices:
            sys.exit(f"{model!r} has no price in config.model_prices (priced: {', '.join(prices)}). Add its price first.")
        for s in (STAGES if stage == "all" else (stage,)):
            want[s] = model
    for a in cfg:
        if a["name"] in {s + "_model" for s in want}:
            a["value"] = want[a["name"][:-len("_model")]]
    put(st["intake"], w)
    publish(st["intake"])
    print("staging now uses:", stage_models(api("GET", f"/workflows/{st['intake']}")) and
          {s: stage_models(api("GET", f"/workflows/{st['intake']}"))[s + "_model"] for s in STAGES})


def live_from_staging(stg, live):
    """Staging's graph, re-pointed at production: live webhook path and ids, live Telegram state, live error workflow."""
    ln = {n["name"]: n for n in live["nodes"]}
    names = {n["name"] for n in stg["nodes"]}
    if names != set(ln):
        sys.exit(f"The node sets differ (only in staging: {sorted(names - set(ln))}; only in live: {sorted(set(ln) - names)}). "
                 "Promote by hand.")
    nodes = json.loads(json.dumps(stg["nodes"]))
    for n in nodes:
        l = ln[n["name"]]
        n["id"] = l["id"]
        for k in ("webhookId", "disabled"):
            if k in l:
                n[k] = l[k]
            else:
                n.pop(k, None)
        if n["type"].endswith(".webhook"):
            n["parameters"]["path"] = l["parameters"]["path"]
        if n["type"].endswith(".telegram"):
            n["parameters"]["chatId"] = l["parameters"].get("chatId")
    return {"name": live["name"], "nodes": nodes, "connections": stg["connections"], "settings": live.get("settings") or {}}


def cmd_promote(args):
    st = load_state()
    if not st:
        sys.exit("No staging.json yet. Run `create` first.")
    live = api("GET", f"/workflows/{PROD['intake']}")
    stg_w = api("GET", f"/workflows/{st['intake']}")
    body = live_from_staging(stg_w, live)
    old = {n["name"]: n for n in live["nodes"]}
    changed = [n["name"] for n in body["nodes"] if n != old[n["name"]]]
    print(f"live: {live['name']} (active={live['active']}, updated {live['updatedAt']})")
    sm_live, sm_stg = stage_models(live), stage_models(stg_w)
    short = lambda m: (m or "(none)").replace("global.amazon.", "").replace("apac.amazon.", "").replace("-v1:0", "")
    print("stage models, live    :", ", ".join(f"{s}={short(sm_live.get(s + '_model'))}" for s in STAGES))
    print("stage models, staging :", ", ".join(f"{s}={short(sm_stg.get(s + '_model'))}" for s in STAGES))
    experimental = {s: sm_stg.get(s + "_model") for s in STAGES if sm_stg.get(s + "_model") not in (DEFAULT_MODEL, None)}
    if experimental:
        print(f"WARNING: staging runs a non-default model on {', '.join(experimental)}. That is probably an experiment, "
              "not a finished change.")
    print(f"{len(changed)} node(s) would change:", ", ".join(changed) or "none")
    if body["connections"] != live["connections"]:
        print("connections would change too")
    if not changed and body["connections"] == live["connections"]:
        print("Nothing to promote.")
        return
    if "--yes" not in args:
        print("\nRead-only so far. To apply and publish: promote --yes")
        return
    if sweep_running():
        sys.exit("A sweep is running, so staging is mid-experiment and promoting now could ship an experimental model to production.\n"
                 "`python3 test/sweep.py stop` first (it restores staging), then promote.")
    if experimental and "--allow-models" not in args:
        sys.exit(f"Refusing: staging runs a non-default model on {', '.join(experimental)}. Promoting an experiment to production is how "
                 "classify ended up on Nova Micro. Put staging back (`sweep.py restore`, or `set-model all=2lite`), or, if this really "
                 "is the model set you want live, add --allow-models.")
    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = BACKUPS / f"promote-{datetime.datetime.now(datetime.timezone.utc):%Y%m%d-%H%M%S}.json"
    backup.write_text(json.dumps(live))
    backup.chmod(0o600)
    print(f"backup of live before the change: {backup}")
    put(PROD["intake"], body)
    publish(PROD["intake"])
    after = api("GET", f"/workflows/{PROD['intake']}")
    print(f"promoted and published: {len(after['nodes'])} nodes, active={after['active']}")
    print("settings unchanged" if after["settings"] == live["settings"] else
          f"WARNING settings differ\n  before: {live['settings']}\n  after:  {after['settings']}")
    print("undo with: python3 test/staging.py rollback --yes")


def cmd_rollback(args):
    files = sorted(BACKUPS.glob("promote-*.json")) if BACKUPS.exists() else []
    if not files:
        sys.exit("No pre-promotion backup found.")
    latest = files[-1]
    if "--yes" not in args:
        sys.exit(f"Would restore {latest.name} to the LIVE intake workflow and publish it. Add --yes to do it.")
    put(PROD["intake"], json.loads(latest.read_text()))
    publish(PROD["intake"])
    print(f"restored {latest.name} and published")


def cmd_status(args):
    st = load_state()
    if not st:
        print("No staging copy yet. Run `create`.")
        return
    for k in ("intake", "errors"):
        w = api("GET", f"/workflows/{st[k]}")
        print(f"{k:7} {st[k]}  active={w.get('active')}  nodes={len(w['nodes'])}  updated={w.get('updatedAt')}")
    print(f"webhook path: /webhook/{st['webhook_path']}")


if __name__ == "__main__":
    cmds = {"create": cmd_create, "sync": cmd_sync, "status": cmd_status, "export": cmd_export, "models": cmd_models,
            "set-model": cmd_set_model, "promote": cmd_promote, "rollback": cmd_rollback}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit(__doc__)
    cmds[sys.argv[1]](sys.argv[2:])
