#!/usr/bin/env python3
"""Replay failed enquiries from the dead_letter view.

Re-posts each failed enquiry to the PRODUCTION webhook and waits for its run to finish. The
workflow's `record received` node reclaims the failed row (same id), so nothing is duplicated.

    python3 test/replay.py \
        --webhook "$WEBHOOK_PROD_URL" \
        --psql "docker exec -i n8n-stack-postgres-1 psql -U n8n -d n8n"

    --dry-run        list what would be replayed, change nothing
    --only <uuid>    replay one enquiry (comma-separated for several)

Why the re-key: the dedupe key is sha256(email|body|date) and the date is the day of the POST.
A replay on a later day would compute a different key, miss the failed row and create a second
one. So each failed row is first re-keyed to the key the replay will compute, then posted.

Standard library only. Exit code 1 if anything is still failed afterwards.
"""
import argparse
import datetime
import hashlib
import json
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request

SEP = "\x1f"  # field separator for psql output; never appears in our data


def psql(cmd, sql):
    """Run SQL on stdin; return (ok, rows, stderr). Callers decide whether a failure is fatal."""
    out = subprocess.run(shlex.split(cmd) + ["-At", "-F", SEP, "-v", "ON_ERROR_STOP=1"],
                         input=sql, capture_output=True, text=True)
    rows = [line.split(SEP) for line in out.stdout.splitlines() if line]
    return out.returncode == 0, rows, out.stderr.strip()


def lit(s):
    """SQL string literal. Values come from our own database, but quote them properly anyway."""
    return "'" + str(s).replace("'", "''") + "'"


def post(url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach the webhook: {e.reason}\nIs the workflow published, and is this the PRODUCTION URL?")


def todays_key(email, body):
    # Must match `normalise`: sha256(`${email}|${body}|${received.slice(0, 10)}`), received in UTC.
    # email and body are stored already normalised (trimmed, lowercased email, tags stripped).
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    return hashlib.sha256(f"{email}|{body}|{day}".encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--webhook", help="PRODUCTION webhook URL (not needed with --dry-run)")
    ap.add_argument("--psql", required=True, help="command that opens psql on the right database")
    ap.add_argument("--only", help="comma-separated enquiry ids")
    ap.add_argument("--dry-run", action="store_true", help="list what would be replayed")
    ap.add_argument("--timeout", type=float, default=120, help="seconds to wait per enquiry (default 120)")
    ap.add_argument("--delay", type=float, default=6, help="seconds between replays (default 6)")
    args = ap.parse_args()
    if not args.dry_run and not args.webhook:
        ap.error("--webhook is required unless --dry-run")

    where = ""
    if args.only:
        where = " where id in (" + ",".join(lit(x.strip()) for x in args.only.split(",")) + ")"
    ok, rows, err = psql(args.psql, "select id, from_email, coalesce(subject, ''), body, "
                                    "coalesce(n8n_execution_id, ''), coalesce(last_error, '') "
                                    f"from dead_letter{where} order by received_at;")
    if not ok:
        sys.exit(f"psql failed:\n{err}")
    if not rows:
        print("dead_letter is empty — nothing to replay.")
        return

    print(f"{len(rows)} failed enquiry(s) in dead_letter\n")
    print(f"{'id':36}  {'last error':45}  result")
    print("-" * 100)
    still_failed = 0

    for i, (eid, email, subject, body, old_exec, last_error) in enumerate(rows):
        label = f"{eid}  {last_error[:45]:45}"
        if args.dry_run:
            print(f"{label}  would replay ({email})")
            continue

        # 1. Re-key so today's POST collides with (and reclaims) this row instead of creating a new one.
        ok, _, err = psql(args.psql, f"update enquiry set external_key = {lit(todays_key(email, body))} "
                                     f"where id = {lit(eid)} and status = 'failed';")
        if not ok:
            # e.g. the same message already arrived again today and was processed under that key
            print(f"{label}  SKIPPED — could not re-key: {err.splitlines()[-1] if err else 'unknown'}")
            still_failed += 1
            continue

        # 2. Re-post it exactly as the customer sent it.
        status = post(args.webhook, {"email": email, "subject": subject, "message": body})
        if status >= 400:
            print(f"{label}  POST failed: HTTP {status}")
            still_failed += 1
            continue

        # 3. Wait for a NEW run (new execution id) to finish with the row.
        deadline, result = time.time() + args.timeout, None
        while time.time() < deadline:
            ok, r, _ = psql(args.psql, f"select status, coalesce(n8n_execution_id, ''), coalesce(action, '') "
                                       f"from enquiry where id = {lit(eid)};")
            if ok and r and r[0][1] != old_exec and r[0][0] in ("processed", "failed"):
                result = r[0]
                break
            time.sleep(1.5)

        if result is None:
            print(f"{label}  timed out — check n8n Executions")
            still_failed += 1
        elif result[0] == "processed":
            print(f"{label}  ✓ processed → {result[2]}  (execution {result[1]})")
        else:
            print(f"{label}  ✗ failed again (execution {result[1]}) — still in dead_letter")
            still_failed += 1

        if i < len(rows) - 1:
            time.sleep(args.delay)

    if not args.dry_run:
        print(f"\n{len(rows) - still_failed}/{len(rows)} replayed successfully")
        sys.exit(1 if still_failed else 0)


if __name__ == "__main__":
    main()
