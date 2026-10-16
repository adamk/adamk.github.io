#!/usr/bin/env python3
"""Build deterministic daily closed-trade curves from the verified CORE ledgers."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import tempfile
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = {
    "C": ("full_slippage_replay", "Full Live-Sequence Slippage Replay", "c_net_pnl"),
    "A": ("natural_nbbo", "Natural NBBO", "a_net_pnl"),
    "B": ("matched_trade_repricing", "Matched-Trade Slippage", "b_net_pnl"),
}
EXPECTED_NOT_EVALUABLE_DATES = [
    "2023-06-05", "2023-10-19", "2026-08-26", "2026-09-22",
]


def _read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"unable to read JSON source: {path}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"JSON source must be an object: {path}")
    return value


def _read_rows(path: Path) -> list[dict[str, str]]:
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise ValueError(f"CSV header missing: {path}")
            return list(reader)
    except OSError as exc:
        raise ValueError(f"unable to read CSV source: {path}") from exc


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
    except OSError as exc:
        raise ValueError(f"unable to hash source: {path}") from exc
    return digest.hexdigest()


def _day(value: str, name: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid {name}: {value}") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"invalid {name}: {value}")
    return parsed


def _decimal(value: str, name: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"invalid {name}: {value}") from exc
    if not result.is_finite():
        raise ValueError(f"invalid {name}: {value}")
    return result


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _same_money(actual: Decimal, expected: object, name: str) -> None:
    target = _decimal(expected, name)
    if abs(actual - target) > Decimal("0.011"):
        raise ValueError(f"{name} does not reconcile: {actual} != {target}")


def _max_drawdown(trades: list[dict[str, str]], starting_equity: Decimal) -> Decimal:
    equity = starting_equity
    peak = equity
    worst = Decimal("0")
    for row in trades:
        equity += _decimal(row.get("net_pnl"), "net_pnl")
        peak = max(peak, equity)
        worst = min(worst, equity - peak)
    return worst


def _validate_sources(study: dict, research_dir: Path, benchmark: dict, cash: dict,
                      expected_not_evaluable_dates: list[str] | None):
    period = study.get("period")
    if (study.get("schema_version") != 1 or
            study.get("classification") != "MODELED_CORE_SLIPPAGE_REPLAY" or
            study.get("independent_verification") != "PASS" or
            not isinstance(period, dict)):
        raise ValueError("CORE study certificate invalid")

    start = period.get("start")
    candidate_end = period.get("end")
    start_day = _day(start, "period start")
    end_day = _day(candidate_end, "period end")
    starting_equity = _decimal(period.get("starting_equity"), "starting equity")
    if starting_equity != Decimal("10000"):
        raise ValueError("starting equity must be $10,000")

    if (benchmark.get("status") != "VERIFIED_ADJUSTED_BENCHMARKS" or
            benchmark.get("initial_value") != 10000 or
            benchmark.get("adjustment") != "split_and_dividend" or
            benchmark.get("normalization") != "starting_adjusted_close" or
            benchmark.get("start") != start or benchmark.get("end") != candidate_end or
            not isinstance(benchmark.get("daily"), list)):
        raise ValueError("adjusted SPY benchmark metadata invalid")
    benchmark_dates = [row.get("date") for row in benchmark["daily"]]
    for value in benchmark_dates:
        _day(value, "SPY session date")
    if (len(benchmark_dates) != period.get("candidate_sessions") or
            not benchmark_dates or benchmark_dates[0] != start or
            benchmark_dates[-1] != candidate_end or
            any(benchmark_dates[i] >= benchmark_dates[i + 1] for i in range(len(benchmark_dates) - 1)) or
            any(not isinstance(row.get("SPY"), (int, float)) or row["SPY"] <= 0
                for row in benchmark["daily"])):
        raise ValueError("SPY daily source dates or prices invalid")

    if (cash.get("schema") != "foxchase-historical-cash-v1" or
            cash.get("base_index") != 100 or cash.get("source_start") != start or
            cash.get("source_end") != candidate_end or
            cash.get("cash", {}).get("series") != "UST_3MO_PAR" or
            cash.get("cash", {}).get("unit") != "annual_percent" or
            not isinstance(cash.get("cash", {}).get("observations"), list) or
            not cash["cash"]["observations"]):
        raise ValueError("historical cash benchmark metadata invalid")

    admission_path = research_dir / "full_slippage_replay" / "session_admission.csv"
    admissions = _read_rows(admission_path)
    if len(admissions) != period.get("candidate_sessions"):
        raise ValueError("session admission coverage does not match candidate sessions")
    if [row.get("date") for row in admissions] != benchmark_dates:
        raise ValueError("session admission dates do not match benchmark sessions")
    statuses = {row.get("date"): row.get("status") for row in admissions}
    if any(status not in ("ADMITTED", "NOT_EVALUABLE") for status in statuses.values()):
        raise ValueError("unknown session admission status")
    admitted = [day for day, status in statuses.items() if status == "ADMITTED"]
    not_evaluable = [day for day, status in statuses.items() if status == "NOT_EVALUABLE"]
    if (len(admitted) != period.get("admitted_sessions") or
            (expected_not_evaluable_dates is not None and not_evaluable != expected_not_evaluable_dates) or
            not_evaluable[-1] != candidate_end or not admitted):
        raise ValueError("session admission counts or exclusions do not match verified study")
    comparison_end = max(day for day in admitted if day < candidate_end)
    comparison_end_day = _day(comparison_end, "common comparison end")
    if comparison_end_day >= end_day:
        raise ValueError("common comparison end must precede the excluded candidate end")
    dates = [value for value in benchmark_dates if _day(value, "SPY session date") <= comparison_end_day]
    if not dates or dates[-1] != comparison_end:
        raise ValueError("common endpoint is missing from benchmark dates")

    scenario_summary = {row.get("id"): row for row in study.get("scenarios", [])}
    if set(scenario_summary) != set(SCENARIOS):
        raise ValueError("scenario summary set invalid")
    yearly_summary = {str(row.get("label", ""))[:4]: row for row in study.get("yearly", [])}
    if not yearly_summary:
        raise ValueError("yearly scenario summary missing")
    return (start, candidate_end, dates, comparison_end, starting_equity,
            statuses, not_evaluable, scenario_summary, yearly_summary, admission_path)


def build_payload(study_path: Path, research_dir: Path, benchmark_path: Path, cash_path: Path,
                  expected_not_evaluable_dates: list[str] | None = EXPECTED_NOT_EVALUABLE_DATES) -> dict:
    study_path = Path(study_path)
    research_dir = Path(research_dir)
    benchmark_path = Path(benchmark_path)
    cash_path = Path(cash_path)
    study = _read_json(study_path)
    benchmark = _read_json(benchmark_path)
    cash = _read_json(cash_path)
    (start, candidate_end, dates, comparison_end, starting_equity,
     statuses, not_evaluable, summary, yearly_summary, admission_path) = _validate_sources(
        study, research_dir, benchmark, cash, expected_not_evaluable_dates)

    start_day = _day(start, "period start")
    comparison_end_day = _day(comparison_end, "common comparison end")
    excluded_before_end = [value for value in not_evaluable if _day(value, "excluded date") <= comparison_end_day]
    expected_gap_count = (len(expected_not_evaluable_dates) - 1
                          if expected_not_evaluable_dates is not None else len(not_evaluable) - 1)
    if len(excluded_before_end) != expected_gap_count:
        raise ValueError("earlier not-evaluable session gap count is inconsistent")

    scenarios = []
    ledger_paths = {}
    for scenario_id in ("C", "A", "B"):
        folder, label, yearly_field = SCENARIOS[scenario_id]
        ledger_path = research_dir / folder / "trade_ledger.csv"
        rows = _read_rows(ledger_path)
        if not rows:
            raise ValueError(f"{scenario_id} trade ledger is empty")
        rows.sort(key=lambda row: (row.get("exit_time_et", ""), row.get("trade_id", "")))
        by_date: dict[str, Decimal] = defaultdict(Decimal)
        yearly: dict[str, Decimal] = defaultdict(Decimal)
        equity = starting_equity
        peak = equity
        drawdown = Decimal("0")
        net_total = Decimal("0")
        gross_total = Decimal("0")
        fees_total = Decimal("0")
        slippage_total = Decimal("0")
        seen_dates = set()

        for row in rows:
            trade_date = row.get("trade_date", "")
            trade_day = _day(trade_date, "trade date")
            try:
                exit_day = datetime.fromisoformat(row.get("exit_time_et", "")).date()
            except (TypeError, ValueError) as exc:
                raise ValueError(f"invalid exit_time_et for {row.get('trade_id')}") from exc
            if exit_day.isoformat() != trade_date:
                raise ValueError(f"trade_date does not match exit date for {row.get('trade_id')}")
            if trade_day < start_day or trade_date > comparison_end:
                raise ValueError(f"trade outside common comparison period: {row.get('trade_id')}")
            if statuses.get(trade_date) != "ADMITTED":
                raise ValueError(f"trade on not evaluable session: {trade_date}")
            if trade_date in seen_dates:
                raise ValueError(f"multiple trades on one portfolio session: {trade_date}")
            seen_dates.add(trade_date)

            net = _decimal(row.get("net_pnl"), "trade net P&L")
            gross = _decimal(row.get("gross_pnl"), "trade gross P&L")
            fees = _decimal(row.get("fees_assumed"), "assumed fees")
            slippage = _decimal(row.get("slippage_cost_assumed"), "assumed slippage")
            _same_money(net, gross - fees, "trade net P&L after fees")
            by_date[trade_date] += net
            yearly[trade_date[:4]] += net
            net_total += net
            gross_total += gross
            fees_total += fees
            slippage_total += slippage
            equity += net
            peak = max(peak, equity)
            drawdown = min(drawdown, equity - peak)

        metrics = summary[scenario_id]
        if len(rows) != metrics.get("trades"):
            raise ValueError(f"{scenario_id} trade count does not reconcile")
        _same_money(net_total, metrics.get("net_pnl"), f"{scenario_id} summary net P&L")
        _same_money(gross_total - fees_total, net_total, f"{scenario_id} gross/fee arithmetic")
        _same_money(fees_total, metrics.get("assumed_fees"), f"{scenario_id} assumed fees")
        _same_money(slippage_total, metrics.get("added_slippage_cost"), f"{scenario_id} added slippage")
        _same_money(drawdown, metrics.get("maximum_drawdown_dollars"), f"{scenario_id} maximum drawdown")

        positive = sum((value for value in (_decimal(row["net_pnl"], "net P&L") for row in rows) if value > 0), Decimal("0"))
        negative = abs(sum((value for value in (_decimal(row["net_pnl"], "net P&L") for row in rows) if value < 0), Decimal("0")))
        reported_pf = metrics.get("net_profit_factor")
        if negative and reported_pf is not None:
            calculated_pf = positive / negative
            if abs(calculated_pf - _decimal(reported_pf, "net profit factor")) > Decimal("0.00015"):
                raise ValueError(f"{scenario_id} net profit factor does not reconcile")

        for year, row in yearly_summary.items():
            _same_money(yearly.get(year, Decimal("0")), row.get(yearly_field), f"{scenario_id} {year} net P&L")
        if set(yearly) - set(yearly_summary):
            raise ValueError(f"{scenario_id} has a trade year missing from the summary")

        curve_equity = starting_equity
        daily = []
        for session in dates:
            if statuses[session] == "NOT_EVALUABLE":
                daily.append({"date": session, "equity": None})
                continue
            curve_equity += by_date.get(session, Decimal("0"))
            daily.append({"date": session, "equity": _money(curve_equity)})
        _same_money(curve_equity, starting_equity + net_total, f"{scenario_id} curve ending equity")
        ledger_paths[scenario_id] = ledger_path
        scenarios.append({
            "id": scenario_id,
            "label": label,
            "trade_count": len(rows),
            "net_pnl": _money(net_total),
            "ending_equity": _money(curve_equity),
            "net_profit_factor": reported_pf,
            "maximum_drawdown_dollars": _money(drawdown),
            "daily": daily,
        })

    return {
        "schema_version": 1,
        "classification": "MODELED_CORE_CLOSED_TRADE_EQUITY",
        "currency": "USD",
        "curve_basis": "daily cumulative modeled closed-trade net P&L; not intraday mark-to-market equity",
        "period": {
            "start": start,
            "candidate_end": candidate_end,
            "candidate_sessions": len(statuses),
            "admitted_sessions": sum(status == "ADMITTED" for status in statuses.values()),
            "starting_equity": _money(starting_equity),
        },
        "comparison_end": comparison_end,
        "dates": dates,
        "not_evaluable_dates": not_evaluable,
        "gap_dates": excluded_before_end,
        "scenarios": scenarios,
        "source_sha256": {
            "scenario_summary": _sha256(study_path),
            "session_admission": _sha256(admission_path),
            "scenario_ledgers": {key: _sha256(path) for key, path in ledger_paths.items()},
            "adjusted_spy": _sha256(benchmark_path),
            "historical_cash": _sha256(cash_path),
        },
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research-dir", type=Path, required=True,
                        help="directory containing the three verified scenario folders")
    parser.add_argument("--study", type=Path, default=ROOT / "data/core_slippage_replay_20261015.json")
    parser.add_argument("--spy", type=Path, default=ROOT / "data/benchmark_research_20261003.json")
    parser.add_argument("--cash", type=Path, default=ROOT / "data/historical-cash-benchmark.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/core_slippage_equity_curves_20261015.json")
    args = parser.parse_args(argv)
    payload = build_payload(args.study, args.research_dir, args.spy, args.cash)
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent,
                                         prefix=args.output.name + ".", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(args.output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print(f"Wrote {args.output} ({len(payload['dates'])} comparison sessions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
