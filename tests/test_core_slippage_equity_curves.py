import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_core_slippage_equity_curves.py"
SPEC = importlib.util.spec_from_file_location("core_equity_builder", SCRIPT)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


class CurveBuilderTests(unittest.TestCase):
    def fixture(self, root):
        study = {
            "schema_version": 1,
            "classification": "MODELED_CORE_SLIPPAGE_REPLAY",
            "independent_verification": "PASS",
            "period": {
                "start": "2023-01-02", "end": "2023-01-05",
                "candidate_sessions": 4, "admitted_sessions": 2,
                "starting_equity": 10000,
            },
            "scenarios": [
                {"id": "C", "label": "Full Live-Sequence Slippage Replay", "trades": 1,
                 "net_pnl": 5, "maximum_drawdown_dollars": 0,
                 "assumed_fees": 13, "added_slippage_cost": 0},
                {"id": "A", "label": "Natural NBBO", "trades": 2,
                 "net_pnl": 10, "maximum_drawdown_dollars": -10,
                 "assumed_fees": 0, "added_slippage_cost": 0},
                {"id": "B", "label": "Matched-Trade Slippage", "trades": 2,
                 "net_pnl": 5, "maximum_drawdown_dollars": -5,
                 "assumed_fees": 5, "added_slippage_cost": 0},
            ],
            "yearly": [{"label": "2023", "a_net_pnl": 10, "b_net_pnl": 5, "c_net_pnl": 5}],
        }
        write_json(root / "study.json", study)
        admissions = [
            {"date": "2023-01-02", "status": "ADMITTED", "reason": ""},
            {"date": "2023-01-03", "status": "NOT_EVALUABLE", "reason": "missing bars"},
            {"date": "2023-01-04", "status": "ADMITTED", "reason": ""},
            {"date": "2023-01-05", "status": "NOT_EVALUABLE", "reason": "missing inputs"},
        ]
        write_csv(root / "research" / "full_slippage_replay" / "session_admission.csv", admissions)
        ledgers = {
            "A": [("2023-01-02", "20", "0", "20"), ("2023-01-04", "-10", "0", "-10")],
            "B": [("2023-01-02", "15", "5", "10"), ("2023-01-04", "-5", "0", "-5")],
            "C": [("2023-01-04", "18", "13", "5")],
        }
        folders = {"A": "natural_nbbo", "B": "matched_trade_repricing", "C": "full_slippage_replay"}
        for scenario, trades in ledgers.items():
            write_csv(root / "research" / folders[scenario] / "trade_ledger.csv", [
                {"trade_id": f"{scenario}-{i}", "trade_date": date,
                 "exit_time_et": date + "T10:00:00-05:00", "net_pnl": net,
                 "gross_pnl": gross, "fees_assumed": fee, "slippage_cost_assumed": "0"}
                for i, (date, gross, fee, net) in enumerate(trades)
            ])
        dates = ["2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05"]
        write_json(root / "spy.json", {
            "status": "VERIFIED_ADJUSTED_BENCHMARKS", "initial_value": 10000,
            "start": dates[0], "end": dates[-1], "adjustment": "split_and_dividend",
            "normalization": "starting_adjusted_close",
            "daily": [{"date": day, "SPY": 100 + i} for i, day in enumerate(dates)],
        })
        write_json(root / "cash.json", {
            "schema": "foxchase-historical-cash-v1", "base_index": 100,
            "source_start": dates[0], "source_end": dates[-1],
            "cash": {"series": "UST_3MO_PAR", "unit": "annual_percent", "observations": []},
        })
        cash = json.loads((root / "cash.json").read_text())
        cash["cash"]["observations"] = [{"date": "2022-12-30", "annual_yield_pct": 4.5}]
        write_json(root / "cash.json", cash)

    def build(self, root):
        return builder.build_payload(
            study_path=root / "study.json",
            research_dir=root / "research",
            benchmark_path=root / "spy.json",
            cash_path=root / "cash.json",
            expected_not_evaluable_dates=["2023-01-03", "2023-01-05"],
        )

    def test_builds_closed_trade_curves_with_gaps_and_common_endpoint(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            payload = self.build(root)
            self.assertEqual(payload["comparison_end"], "2023-01-04")
            self.assertEqual(payload["not_evaluable_dates"], ["2023-01-03", "2023-01-05"])
            self.assertEqual(payload["dates"], ["2023-01-02", "2023-01-03", "2023-01-04"])
            by_id = {row["id"]: row for row in payload["scenarios"]}
            self.assertEqual([point["equity"] for point in by_id["A"]["daily"]], [10020, None, 10010])
            self.assertEqual(by_id["A"]["ending_equity"], 10010)
            self.assertEqual(by_id["B"]["ending_equity"], 10005)
            self.assertEqual(by_id["C"]["ending_equity"], 10005)
            self.assertEqual(by_id["A"]["maximum_drawdown_dollars"], -10)

    def test_rejects_trade_on_not_evaluable_session(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            path = root / "research" / "natural_nbbo" / "trade_ledger.csv"
            with path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            rows[0]["trade_date"] = "2023-01-03"
            rows[0]["exit_time_et"] = "2023-01-03T10:00:00-05:00"
            write_csv(path, rows)
            with self.assertRaisesRegex(ValueError, "not evaluable"):
                self.build(root)

    def test_rejects_duplicate_trade_date_or_trade_exit_date_mismatch(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            path = root / "research" / "natural_nbbo" / "trade_ledger.csv"
            with path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            rows[1]["exit_time_et"] = "2023-01-03T10:00:00-05:00"
            write_csv(path, rows)
            with self.assertRaisesRegex(ValueError, "trade_date.*exit date"):
                self.build(root)

    def test_rejects_summary_or_benchmark_period_mismatch(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            study_path = root / "study.json"
            study = json.loads(study_path.read_text())
            study["scenarios"][0]["net_pnl"] = 6
            write_json(study_path, study)
            with self.assertRaisesRegex(ValueError, "summary net P&L"):
                self.build(root)


if __name__ == "__main__":
    unittest.main()
