#!/usr/bin/env python3
"""Check the workflow exports in workflows/ before they reach git (CI runs this on every push).

    python3 test/check_exports.py            # exit code 1 if any check fails

For each workflows/*.json:
  - it parses, and has a name, nodes and connections
  - node names are unique, and every connection points at a node that exists
  - no pinned data (a pinned webhook run carries a real request's headers: Tailscale login, name, IP)
  - credentials are references only ({id, name}), never inline values
  - Telegram chat ids are the {{ALERT_CHAT_ID}} placeholder (the real one stays in .env)
  - email addresses are synthetic (@example.com) only
  - nothing that looks like a key or token (AWS, GitHub, OpenAI/Anthropic, Slack, JWT, private key)

The secret scan in CI (gitleaks) covers the whole repo; this file adds the n8n-specific rules. Standard library only.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
ALLOWED_EMAIL = re.compile(r"@example\.com$", re.I)
SECRETS = {
    "AWS access key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}"),
    "OpenAI/Anthropic key": re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}"),
    "Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    "JWT": re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "Telegram bot token": re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b"),
}


def strings(o):
    """Every string value in a JSON document."""
    if isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)
    elif isinstance(o, str):
        yield o


def check(path):
    """Problems found in one export, as a list of strings (empty = clean)."""
    try:
        w = json.loads(path.read_text())
    except ValueError as e:
        return [f"not valid JSON: {e}"]
    problems = []
    for key in ("name", "nodes", "connections"):
        if key not in w:
            problems.append(f"missing `{key}`")
    if problems:
        return problems

    names = [n.get("name") for n in w["nodes"]]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        problems.append(f"duplicate node names: {dupes}")
    known = set(names)
    for src, outs in w["connections"].items():
        if src not in known:
            problems.append(f"connection from unknown node {src!r}")
        for kind in outs.values():
            for branch in kind:
                for c in branch or []:
                    if c.get("node") not in known:
                        problems.append(f"connection {src!r} -> unknown node {c.get('node')!r}")

    if w.get("pinData"):
        problems.append(f"pinned data on {sorted(w['pinData'])} (export with test/staging.py, which drops it)")

    for n in w["nodes"]:
        for kind, ref in (n.get("credentials") or {}).items():
            if not isinstance(ref, dict) or set(ref) - {"id", "name"}:
                problems.append(f"node {n['name']!r}: credential {kind!r} is more than an {{id, name}} reference")
        if n.get("type", "").endswith(".telegram"):
            chat = (n.get("parameters") or {}).get("chatId")
            if chat is not None and chat != "{{ALERT_CHAT_ID}}":
                problems.append(f"node {n['name']!r}: Telegram chatId is not the {{{{ALERT_CHAT_ID}}}} placeholder")

    for s in strings(w):
        for addr in EMAIL.findall(s):
            if not ALLOWED_EMAIL.search(addr):
                problems.append(f"non-synthetic email address {addr!r}")
        for what, rx in SECRETS.items():
            if rx.search(s):
                problems.append(f"looks like a {what}")
    return sorted(set(problems))


def main():
    files = sorted((ROOT / "workflows").glob("*.json"))
    if not files:
        sys.exit("No workflow exports found.")
    failed = 0
    for f in files:
        problems = check(f)
        print(f"{'FAIL' if problems else 'ok  '}  {f.relative_to(ROOT)}")
        for p in problems:
            print(f"      - {p}")
        failed += bool(problems)
    print(f"{len(files) - failed}/{len(files)} exports clean")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
