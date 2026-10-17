#!/usr/bin/env python3
"""Compare scoring runs in test/results/, and gate a run against a baseline.

    python3 test/compare.py                       # table of the latest runs
    python3 test/compare.py --all                 # every run
    python3 test/compare.py --check 20261017-091500
        # gate that run against test/baseline.json; exit code 1 if any gate fails

Gates (a model/prompt set qualifies only if ALL pass; then the cheapest wins):
  1. safety flags: every scored safety check passes
  2. invented claims: 0 sendable replies with an invented price
  3. failed runs / missing rows: 0
  4. category accuracy: not more than --tolerance cases below the baseline
  5. action accuracy:   not more than --tolerance cases below the baseline
  6. cost per enquiry:  not more than --cost-margin above the baseline

Run-to-run variance is about +/-1-2 cases at temperature 0, so judge a change on two runs and
leave --tolerance at 1 or 2. A run with a different number of cases than the baseline (e.g. one
made with --only) is not comparable and fails the check.

Results files written before --label existed show label "-". Standard library only.
"""
import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE / "results"
BASELINE = HERE / "baseline.json"


def summarise(path):
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    scored = [r for r in rows if r.get("got")]

    def tally(key):
        xs = [r[key] for r in scored if key in r]
        return sum(xs), len(xs)

    replies = [r for r in scored if "invented_prices" in r]
    costs = [r["got"]["cost_usd"] for r in scored]
    return {
        "run": path.stem,
        "label": (rows[0].get("label") or "-") if rows else "-",
        "cases": len(rows),
        "scored": len(scored),
        "category": tally("category_ok"),
        "safety": tally("safety_ok"),
        "slots": tally("slots_ok"),
        "actions": tally("action_ok"),
        "invented": sum(1 for r in replies if r["invented_prices"]),
        "replies": len(replies),
        "failed": len(rows) - len(scored),
        "cost": sum(costs) / len(costs) if costs else 0.0,
    }


def frac(t):
    return f"{t[0]}/{t[1]}" if t[1] else "-"


def table(summaries):
    print(f"{'run':16} {'label':28} {'n':>3} {'cat':>6} {'flags':>6} {'slots':>6} {'act':>6} "
          f"{'invent':>6} {'fail':>4} {'$/enq':>9}")
    print("-" * 100)
    for s in summaries:
        print(f"{s['run']:16} {s['label'][:28]:28} {s['cases']:>3} {frac(s['category']):>6} "
              f"{frac(s['safety']):>6} {frac(s['slots']):>6} {frac(s['actions']):>6} "
              f"{s['invented']:>6} {s['failed']:>4} {s['cost']:>9.6f}")


def check(run, base, tol, margin):
    ok = True

    def gate(passed, name, detail):
        nonlocal ok
        ok &= passed
        print(f"  {'PASS' if passed else 'FAIL'}  {name:22} {detail}")

    print(f"Run {run['run']} ({run['label']}) vs baseline {base['run']} ({base['label']})")
    if run["cases"] != base["cases"]:
        gate(False, "comparable", f"{run['cases']} cases vs {base['cases']} in the baseline")
        return False
    gate(run["safety"][0] == run["safety"][1] and run["safety"][1] > 0, "safety flags", frac(run["safety"]))
    gate(run["invented"] == 0, "invented claims", f"{run['invented']} of {run['replies']} replies")
    gate(run["failed"] == 0, "failed / missing", str(run["failed"]))
    for key, name in (("category", "category accuracy"), ("actions", "action accuracy")):
        gate(run[key][0] >= base[key][0] - tol, name,
             f"{frac(run[key])} (baseline {frac(base[key])}, tolerance {tol})")
    limit = base["cost"] * (1 + margin)
    gate(run["cost"] <= limit, "cost per enquiry",
         f"${run['cost']:.6f} (baseline ${base['cost']:.6f}, limit ${limit:.6f})")
    print("  => " + ("ALL GATES PASS" if ok else "GATES FAILED"))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="show every run (default: the latest 12)")
    ap.add_argument("--check", metavar="RUN", help="gate this run id against the baseline")
    ap.add_argument("--baseline", metavar="RUN", help="baseline run id (default: test/baseline.json)")
    ap.add_argument("--tolerance", type=int, default=1, help="cases of slack on accuracy (default 1)")
    ap.add_argument("--cost-margin", type=float, default=0.25, help="allowed cost rise, 0.25 = +25%%")
    args = ap.parse_args()

    files = sorted(RESULTS.glob("*.jsonl"))
    if not files:
        sys.exit("No results yet. Run test/score.py first.")
    by_id = {f.stem: f for f in files}

    if args.check:
        base_id = args.baseline or json.loads(BASELINE.read_text())["run"]
        for rid in (args.check, base_id):
            if rid not in by_id:
                sys.exit(f"No results file for run {rid}.")
        sys.exit(0 if check(summarise(by_id[args.check]), summarise(by_id[base_id]),
                            args.tolerance, args.cost_margin) else 1)

    shown = files if args.all else files[-12:]
    table([summarise(f) for f in shown])
    if BASELINE.exists():
        b = json.loads(BASELINE.read_text())
        print(f"\nbaseline: {b['run']} — {b.get('note', '')}")


if __name__ == "__main__":
    main()
