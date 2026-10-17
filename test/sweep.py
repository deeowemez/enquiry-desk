#!/usr/bin/env python3
"""Run model-comparison experiments on STAGING, with a lock, a real stop button and a guaranteed restore.

    python3 test/sweep.py start --exp draft=pro --exp draft=pro,verify=pro --runs 2 [--dry-run]
    python3 test/sweep.py status      # what is running, which experiment and run, recent events
    python3 test/sweep.py stop        # end it now; staging is put back on Nova 2 Lite before this returns
    python3 test/sweep.py report      # the gated table for the latest sweep
    python3 test/sweep.py restore     # emergency: staging back on Nova 2 Lite, clear a stale lock

An experiment is a list of stage=model pairs; every other stage stays on Nova 2 Lite. Models are
`2lite`, `micro`, `lite`, `pro` or a full model id that has a price in the staging `config` node.
`--exp baseline` runs the all-Nova-2-Lite control (use it to see run-to-run spread).

    --exp draft=pro                      draft on Nova Pro
    --exp draft=pro,verify=pro           draft and verify on Nova Pro
    --exp all=lite                       every stage on Nova Lite

Safety, because an earlier hand-rolled sweep needed killing by process id:
  * one sweep at a time (a lock in ~/.local/state/enquiry-desk/); `staging.py set-model` and `sync` refuse while it runs
  * `stop` and Ctrl-C end the current scoring run, restore staging, and remove the lock
  * staging is restored to Nova 2 Lite on every exit path, including errors
  * a run cut short writes no results file (score.py writes only at the end)
  * only staging is touched: never the live workflow

Each full run is gated against test/baseline.json like `compare.py --check`. Accuracy is the priority, so the cost
margin defaults to +500%; tighten it with --cost-margin. Runs made with --only are partial and are not gated.
Standard library only.
"""
import argparse
import contextlib
import datetime
import io
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import compare  # noqa: E402
import staging  # noqa: E402

ALIASES = {"2lite": "global.amazon.nova-2-lite-v1:0", "micro": "apac.amazon.nova-micro-v1:0",
           "lite": "apac.amazon.nova-lite-v1:0", "pro": "apac.amazon.nova-pro-v1:0"}
SHORT = {v: "nova-" + k.replace("2lite", "2-lite") for k, v in ALIASES.items()}
BASE = ALIASES["2lite"]
STAGES = staging.STAGES
DIR = staging.BACKUPS
LOCK = staging.SWEEP_LOCK
PSQL = "docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n"
SECONDS_PER_CASE = 16          # measured: about 6.5 minutes for 24 cases at --delay 6


class Stop(Exception):
    pass


# ---------------------------------------------------------------- helpers
def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def model_id(name):
    return ALIASES.get(name, name)


def parse_exp(spec):
    """'draft=pro,verify=pro' -> {'draft': id, 'verify': id}; 'baseline' -> {}; 'all=lite' -> every stage."""
    if spec == "baseline":
        return {}
    out = {}
    for part in spec.split(","):
        stage, _, model = part.partition("=")
        if not model or (stage != "all" and stage not in STAGES):
            sys.exit(f"bad experiment {spec!r}: use stage=model with stages {', '.join(STAGES)} or all")
        for s in (STAGES if stage == "all" else (stage,)):
            out[s] = model_id(model)
    return out


def label_for(models):
    if not models:
        return "baseline nova-2-lite x4"
    named = ", ".join(f"{s}={SHORT.get(m, m)}" for s, m in models.items())
    return f"{named}, rest nova-2-lite"


def priced_models():
    st = staging.load_state()
    if not st:
        sys.exit("No staging copy yet (test/staging.py create).")
    cfg = staging.stage_models(staging.api("GET", f"/workflows/{st['intake']}"))
    return set(json.loads(cfg.get("model_prices", "{}")))


def load_env():
    env = dict(os.environ)
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, _, v = line.partition("=")
                env.setdefault(k.strip(), v.strip().strip("\"'"))
    return env


def staging_webhook():
    url = load_env().get("WEBHOOK_PROD_URL", "")
    if not url.endswith("/enquiry"):
        sys.exit("WEBHOOK_PROD_URL (from .env) should end in /enquiry.")
    return url[: -len("enquiry")] + staging.STAGING_PATH


def log_event(logfile, **ev):
    ev = {"t": now(), **ev}
    with open(logfile, "a") as f:
        f.write(json.dumps(ev) + "\n")


def read_lock():
    try:
        return json.loads(LOCK.read_text())
    except (OSError, ValueError):
        return None


def set_models(models):
    """Put staging on BASE with the given stage overrides. Raises RuntimeError if staging refuses."""
    args = [f"all={BASE}"] + [f"{s}={m}" for s, m in models.items()]
    os.environ["ENQUIRY_SWEEP"] = "1"
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            staging.cmd_set_model(args)
    except SystemExit as e:
        raise RuntimeError(str(e)) from None


# ---------------------------------------------------------------- the run (a detached child process)
def run_plan(plan_file):
    plan = json.loads(pathlib.Path(plan_file).read_text())
    logfile = pathlib.Path(plan["log"])
    DIR.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(json.dumps({"pid": os.getpid(), "started": plan["started"], "plan": plan_file}))
    signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(Stop()))
    signal.signal(signal.SIGINT, lambda *a: (_ for _ in ()).throw(Stop()))
    scorer = None
    results = []                       # {exp, label, run, run_id}
    try:
        for ex in plan["experiments"]:
            try:
                set_models(ex["models"])
            except RuntimeError as e:
                log_event(logfile, event="set_failed", experiment=ex["label"], error=str(e)[:300])
                continue
            log_event(logfile, event="models_set", experiment=ex["label"], models=ex["models"])
            time.sleep(5)              # let n8n re-register the published webhook
            for n in range(1, plan["runs"] + 1):
                label = f"{ex['label']} #{n}"
                cmd = [sys.executable, str(HERE / "score.py"), "--webhook", plan["webhook"], "--psql", plan["psql"],
                       "--label", label, "--delay", str(plan["delay"])]
                if plan.get("only"):
                    cmd += ["--only", plan["only"]]
                log_event(logfile, event="run_start", experiment=ex["label"], run=n)
                out = DIR / f"{pathlib.Path(plan['log']).stem}-{len(results) + 1}.out"
                with open(out, "w") as fh:
                    scorer = subprocess.Popen(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=ROOT)
                    scorer.wait()
                scorer = None
                m = re.search(r"results/(\d{8}-\d{6})\.jsonl", out.read_text())
                run_id = m.group(1) if m else None
                results.append({"experiment": ex["label"], "run": n, "run_id": run_id})
                log_event(logfile, event="run_done", experiment=ex["label"], run=n, run_id=run_id)
        log_event(logfile, event="finished")
    except Stop:
        log_event(logfile, event="stopped")
    except Exception as e:             # never leave staging on an experimental model
        log_event(logfile, event="error", error=repr(e)[:300])
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if scorer and scorer.poll() is None:
            scorer.terminate()
            try:
                scorer.wait(timeout=20)
            except subprocess.TimeoutExpired:
                scorer.kill()
        try:
            set_models({})
            log_event(logfile, event="restored", models="all nova-2-lite")
        except RuntimeError as e:
            log_event(logfile, event="restore_failed", error=str(e)[:300])
        pathlib.Path(plan["log"]).with_suffix(".results.json").write_text(json.dumps(results, indent=2))
        with contextlib.suppress(OSError):
            LOCK.unlink()


# ---------------------------------------------------------------- commands
def cmd_start(a):
    exps = a.exp or []
    if not exps:
        sys.exit("give at least one --exp, e.g. --exp draft=pro (or --exp baseline)")
    plan_exps = []
    prices = priced_models()
    for spec in exps:
        models = parse_exp(spec)
        bad = [m for m in models.values() if m not in prices]
        if bad:
            sys.exit(f"no price in config.model_prices for {bad}. Priced: {sorted(prices)}")
        plan_exps.append({"spec": spec, "models": models, "label": label_for(models)})
    n_cases = len(a.only.split(",")) if a.only else 24
    minutes = len(plan_exps) * a.runs * n_cases * (SECONDS_PER_CASE + (a.delay - 6)) / 60
    print(f"{len(plan_exps)} experiment(s) x {a.runs} run(s) x {n_cases} cases, about {minutes:.0f} min:")
    for ex in plan_exps:
        print("  -", ex["label"])
    if a.dry_run:
        print("(dry run: nothing started)")
        return
    DIR.mkdir(parents=True, exist_ok=True)
    live = staging.sweep_running()
    if live:
        sys.exit(f"A sweep is already running (pid {live['pid']}, started {live['started']}). `sweep.py status` or `stop`.")
    with contextlib.suppress(OSError):
        LOCK.unlink()                    # stale lock from a dead process
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    plan = {"started": now(), "runs": a.runs, "only": a.only, "delay": a.delay, "webhook": staging_webhook(),
            "psql": a.psql, "tolerance": a.tolerance, "cost_margin": a.cost_margin,
            "log": str(DIR / f"sweep-{stamp}.jsonl"), "experiments": plan_exps}
    plan_file = DIR / f"sweep-{stamp}.plan.json"
    plan_file.write_text(json.dumps(plan, indent=2))
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)     # claim it before spawning: no double start
        os.write(fd, json.dumps({"pid": os.getpid(), "started": plan["started"], "plan": str(plan_file)}).encode())
        os.close(fd)
    except FileExistsError:
        sys.exit("Another sweep just started.")
    if a.foreground:
        run_plan(str(plan_file))
        return cmd_report(a)
    child = subprocess.Popen([sys.executable, __file__, "_run", str(plan_file)], start_new_session=True,
                             stdin=subprocess.DEVNULL, stdout=open(DIR / f"sweep-{stamp}.stdout", "w"), stderr=subprocess.STDOUT)
    LOCK.write_text(json.dumps({"pid": child.pid, "started": plan["started"], "plan": str(plan_file)}))
    print(f"started in the background, pid {child.pid}.  status: sweep.py status   stop: sweep.py stop")


def latest(pattern):
    files = sorted(DIR.glob(pattern)) if DIR.exists() else []
    return files[-1] if files else None


def cmd_status(a):
    lock = staging.sweep_running()
    plan_file = pathlib.Path(lock["plan"]) if lock else latest("sweep-*.plan.json")
    if not plan_file:
        print("No sweep has been run.")
        return
    plan = json.loads(plan_file.read_text())
    events = [json.loads(l) for l in pathlib.Path(plan["log"]).read_text().splitlines()] if pathlib.Path(plan["log"]).exists() else []
    print(("RUNNING" if lock else "not running") + f"  (started {plan['started']})")
    done = sum(1 for e in events if e["event"] == "run_done")
    total = len(plan["experiments"]) * plan["runs"]
    print(f"progress: {done}/{total} runs finished")
    if lock and events:
        last = events[-1]
        print(f"now: {last.get('experiment', '')} {('run ' + str(last['run'])) if 'run' in last else ''} ({last['event']} at {last['t']})")
    for e in events[-6:]:
        extra = e.get("run_id") or e.get("error") or ""
        print(f"  {e['t']}  {e['event']:12} {e.get('experiment', '')} {extra}")
    st = staging.load_state()
    if st:
        cur = staging.stage_models(staging.api("GET", f"/workflows/{st['intake']}"))
        print("staging now uses:", {s: SHORT.get(cur[s + "_model"], cur[s + "_model"]) for s in STAGES})


def cmd_stop(a):
    lock = staging.sweep_running()
    if not lock:
        print("No sweep is running.")
        return
    os.kill(lock["pid"], signal.SIGTERM)
    print(f"stopping pid {lock['pid']} ...")
    for _ in range(40):
        time.sleep(2)
        if not staging.sweep_running():
            break
    else:
        sys.exit("It has not stopped after 80 s. Check `sweep.py status`; `sweep.py restore` puts staging back.")
    print("stopped.")
    cmd_status(a)


def cmd_restore(a):
    if staging.sweep_running():
        sys.exit("A sweep is running: use `stop`.")
    with contextlib.suppress(OSError):
        LOCK.unlink()
    set_models({})
    print("staging restored to Nova 2 Lite on every stage; lock cleared.")


def cmd_report(a):
    plan_file = latest("sweep-*.plan.json")
    if not plan_file:
        sys.exit("No sweep has been run.")
    plan = json.loads(plan_file.read_text())
    rf = pathlib.Path(plan["log"]).with_suffix(".results.json")
    if not rf.exists():
        sys.exit("That sweep has not finished writing results (still running, or it was stopped before any run completed).")
    results = [r for r in json.loads(rf.read_text()) if r["run_id"]]
    base = compare.summarise(compare.RESULTS / f"{json.loads(compare.BASELINE.read_text())['run']}.jsonl")
    print(f"sweep started {plan['started']}; baseline {base['run']}: category {compare.frac(base['category'])}, flags "
          f"{compare.frac(base['safety'])}, actions {compare.frac(base['actions'])}, ${base['cost']:.6f}\n")
    compare.table([compare.summarise(compare.RESULTS / f"{r['run_id']}.jsonl") for r in results])
    print()
    for r in results:
        s = compare.summarise(compare.RESULTS / f"{r['run_id']}.jsonl")
        if s["cases"] != base["cases"]:
            print(f"{r['run_id']}  partial run ({s['cases']} cases): not gated")
            continue
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            ok = compare.check(s, base, plan["tolerance"], plan["cost_margin"])
        fails = [l.split()[1] + " " + " ".join(l.split()[2:4]) for l in buf.getvalue().splitlines() if "FAIL" in l]
        print(f"{r['run_id']}  {s['label'][:52]:52}  " + ("PASSES the gate" if ok else "fails: " + "; ".join(fails)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("start")
    s.add_argument("--exp", action="append", help="stage=model[,stage=model] or baseline (repeatable)")
    s.add_argument("--runs", type=int, default=2, help="runs per experiment (default 2)")
    s.add_argument("--only", help="comma-separated case ids (partial runs are not gated)")
    s.add_argument("--delay", type=float, default=6, help="seconds between cases (default 6)")
    s.add_argument("--psql", default=PSQL)
    s.add_argument("--tolerance", type=int, default=1, help="cases of slack on accuracy (default 1)")
    s.add_argument("--cost-margin", type=float, default=5.0, help="allowed cost rise, 5.0 = +500%% (accuracy first)")
    s.add_argument("--foreground", action="store_true", help="run in this process instead of detaching")
    s.add_argument("--dry-run", action="store_true")
    for name in ("status", "stop", "restore", "report"):
        sub.add_parser(name)
    r = sub.add_parser("_run")
    r.add_argument("plan")
    a = ap.parse_args()
    if a.cmd == "_run":
        return run_plan(a.plan)
    {"start": cmd_start, "status": cmd_status, "stop": cmd_stop, "restore": cmd_restore, "report": cmd_report}[a.cmd](a)


if __name__ == "__main__":
    main()
