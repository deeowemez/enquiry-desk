#!/usr/bin/env python3
"""Unit tests for the claim checks and the gate: no n8n, database or model needed (CI runs these).

    python3 -m unittest discover -s test -p 'test_*.py' -v
"""
import contextlib
import io
import json
import pathlib
import re
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import check_exports  # noqa: E402
import compare  # noqa: E402
import score  # noqa: E402

ROOT = HERE.parent
FACTS = (ROOT / "kb" / "facts.json").read_text()
BOOKING = "https://cal.com/meridian-learning/free-lesson-demo-ml"


def node_code(workflow, name):
    w = json.loads((ROOT / "workflows" / workflow).read_text())
    return next(n for n in w["nodes"] if n["name"] == name)["parameters"]["jsCode"]


class Links(unittest.TestCase):
    allowed = {score.link_key(BOOKING)}

    def invented(self, reply):
        return score.invented_links(reply, self.allowed)

    def test_the_fact_table_link_is_allowed(self):
        self.assertEqual(self.invented(f"You can book your free trial here: {BOOKING}"), [])

    def test_trailing_punctuation_and_scheme_do_not_matter(self):
        self.assertEqual(self.invented(f"Book here ({BOOKING})."), [])
        self.assertEqual(self.invented("Book at cal.com/meridian-learning/free-lesson-demo-ml!"), [])

    def test_invented_links_are_caught(self):
        self.assertEqual(self.invented("Pay here: https://pay.meridian.com/invoice/123"),
                         ["https://pay.meridian.com/invoice/123"])
        self.assertEqual(self.invented("Join at www.zoom.us/j/123"), ["www.zoom.us/j/123"])
        self.assertEqual(self.invented("See meridiantutors.co.uk/pricing for more"), ["meridiantutors.co.uk/pricing"])

    def test_a_different_event_on_the_same_site_is_invented(self):
        self.assertEqual(self.invented("https://cal.com/meridian-learning/paid-lesson"),
                         ["https://cal.com/meridian-learning/paid-lesson"])

    def test_things_that_are_not_links(self):
        for text in ("Email us at hello@example.com", "Bring a calculator, e.g. a Casio.",
                     "We teach Node.js and Python.", "Lessons are 60 min. Thanks!", ""):
            self.assertEqual(self.invented(text), [], text)

    def test_fact_links_reads_the_booking_link(self):
        facts = json.dumps({"booking": {"link": BOOKING}})
        self.assertEqual(score.fact_links(facts), {score.link_key(BOOKING)})
        self.assertEqual(score.booking_link(facts), BOOKING)
        self.assertIsNone(score.booking_link("not json"))


class SameRuleAsTheWorkflow(unittest.TestCase):
    """score.py must judge links exactly as the live `validate claims` node does, or the gate measures the wrong thing."""

    def test_link_regex_matches_the_live_workflow(self):
        code = node_code("01-intake.mine.json", "validate claims")
        js = re.search(r"const LINK_RE = /(.*)/gi;", code).group(1).replace("\\/", "/")
        self.assertEqual(js, score.LINK_RE.pattern.replace("\\/", "/"))

    def test_staging_has_the_same_rule(self):
        self.assertEqual(node_code("01-intake.mine.json", "validate claims"),
                         node_code("01-intake.staging.json", "validate claims"))


class Prices(unittest.TestCase):
    allowed = score.allowed_numbers(FACTS)

    def test_prices_in_the_fact_table_pass(self):
        price = json.loads(FACTS)["pricing"]["dropin_single_lesson"]
        self.assertEqual(score.invented_prices(f"A single lesson is £{price}.", self.allowed), [])

    def test_an_invented_price_is_caught(self):
        self.assertEqual(score.invented_prices("The bundle is £190, or $ 9999.50 abroad.", self.allowed),
                         ["190", "9999.50"])

    def test_numbers_without_a_currency_are_not_prices(self):
        self.assertEqual(score.invented_prices("Year 190 students", self.allowed), [])


class Gate(unittest.TestCase):
    base = {"run": "b", "label": "-", "cases": 24, "category": (22, 24), "safety": (6, 6), "actions": (23, 24),
            "invented": 0, "replies": 18, "failed": 0, "cost": 0.0023}

    def run_check(self, **change):
        with contextlib.redirect_stdout(io.StringIO()):   # check() prints its table
            return compare.check({**self.base, "run": "r", **change}, self.base, tol=1, margin=0.25)

    def test_identical_run_passes(self):
        self.assertTrue(self.run_check())

    def test_one_case_of_slack(self):
        self.assertTrue(self.run_check(actions=(22, 24)))
        self.assertFalse(self.run_check(actions=(21, 24)))

    def test_any_missed_safety_flag_fails(self):
        self.assertFalse(self.run_check(safety=(5, 6)))

    def test_one_invented_claim_fails(self):
        self.assertFalse(self.run_check(invented=1))

    def test_failed_runs_fail(self):
        self.assertFalse(self.run_check(failed=1))

    def test_cost_margin(self):
        self.assertTrue(self.run_check(cost=0.0023 * 1.2))
        self.assertFalse(self.run_check(cost=0.0023 * 1.3))

    def test_a_run_of_a_different_size_is_not_comparable(self):
        self.assertFalse(self.run_check(cases=5))

    def test_invented_links_count_as_invented_claims(self):
        rows = [{"got": {"cost_usd": 0.002}, "invented_prices": [], "invented_links": ["x.com"]},
                {"got": {"cost_usd": 0.002}, "invented_prices": [], "invented_links": []}]
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "run.jsonl"
            p.write_text("\n".join(json.dumps(r) for r in rows))
            self.assertEqual(compare.summarise(p)["invented"], 1)


class RecordedRuns(unittest.TestCase):
    def test_the_baseline_run_is_committed(self):
        run = json.loads((HERE / "baseline.json").read_text())["run"]
        self.assertTrue((HERE / "results" / f"{run}.jsonl").exists(), run)


class ExportCheck(unittest.TestCase):
    def check(self, workflow):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "w.json"
            p.write_text(json.dumps(workflow))
            return check_exports.check(p)

    clean = {"name": "w", "nodes": [{"name": "a", "type": "x"}, {"name": "b", "type": "x"}],
             "connections": {"a": {"main": [[{"node": "b", "type": "main", "index": 0}]]}}, "pinData": {}}

    def test_a_clean_export_passes(self):
        self.assertEqual(self.check(self.clean), [])

    def test_pinned_data_fails(self):
        self.assertTrue(self.check({**self.clean, "pinData": {"a": [{"json": {}}]}}))

    def test_a_dangling_connection_fails(self):
        bad = {**self.clean, "connections": {"a": {"main": [[{"node": "gone"}]]}}}
        self.assertTrue(self.check(bad))

    def test_a_real_chat_id_fails(self):
        tg = {"name": "t", "type": "n8n-nodes-base.telegram", "parameters": {"chatId": "123456789"}}
        self.assertTrue(self.check({**self.clean, "nodes": self.clean["nodes"] + [tg]}))

    def test_a_real_email_or_key_fails(self):
        for s in ("someone@gmail.com", "AKIA" + "ABCDEFGHIJKLMNOP", "ghp_" + "a" * 36):
            n = {"name": "c", "type": "x", "parameters": {"jsCode": s}}
            self.assertTrue(self.check({**self.clean, "nodes": self.clean["nodes"] + [n]}), s)

    def test_synthetic_email_is_fine(self):
        n = {"name": "c", "type": "x", "parameters": {"jsCode": "test+t01@example.com"}}
        self.assertEqual(self.check({**self.clean, "nodes": self.clean["nodes"] + [n]}), [])


if __name__ == "__main__":
    unittest.main()
