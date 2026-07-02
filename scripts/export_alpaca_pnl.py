import os
import json
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv(dotenv_path=".env")

API_KEY = os.getenv("ALPACA_API_KEY")
SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")

if not API_KEY or not SECRET_KEY:
    raise SystemExit("Missing ALPACA_API_KEY or ALPACA_SECRET_KEY in .env")

BASE_URL = "https://api.alpaca.markets"

headers = {
    "APCA-API-KEY-ID": API_KEY,
    "APCA-API-SECRET-KEY": SECRET_KEY,
}

def get_json(path, params=None):
    r = requests.get(f"{BASE_URL}{path}", headers=headers, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def spread_key(order):
    legs = order.get("legs") or []
    symbols = sorted([leg.get("symbol", "") for leg in legs if leg.get("symbol")])
    return "|".join(symbols)

def order_time(order):
    return order.get("filled_at") or order.get("submitted_at") or ""

account = get_json("/v2/account")

history = get_json(
    "/v2/account/portfolio/history",
    params={
        "period": "1A",
        "timeframe": "1D",
        "pnl_reset": "no_reset",
        "cashflow_types": "NONE",
    },
)

points = []
for i, ts in enumerate(history.get("timestamp", [])):
    equity = history.get("equity", [])
    points.append({
        "date": datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d"),
        "equity": equity[i] if i < len(equity) else None,
    })

orders = get_json(
    "/v2/orders",
    params={
        "status": "all",
        "limit": 500,
        "direction": "asc",
        "nested": "true",
    },
)

mleg_orders = [
    o for o in orders
    if o.get("order_class") == "mleg"
    and o.get("status") == "filled"
    and o.get("filled_avg_price") is not None
    and o.get("filled_qty") is not None
    and o.get("legs")
]

open_orders_by_key = defaultdict(list)
closed_trades = []

for o in sorted(mleg_orders, key=order_time):
    key = spread_key(o)
    if not key:
        continue

    intents = {leg.get("position_intent") for leg in (o.get("legs") or [])}

    is_open = "sell_to_open" in intents or "buy_to_open" in intents
    is_close = "buy_to_close" in intents or "sell_to_close" in intents

    if is_open:
        open_orders_by_key[key].append(o)

    elif is_close and open_orders_by_key[key]:
        open_order = open_orders_by_key[key].pop(0)

        open_price = abs(float(open_order["filled_avg_price"]))
        close_price = abs(float(o["filled_avg_price"]))
        qty = float(o["filled_qty"])

        pnl = (open_price - close_price) * qty * 100

        closed_trades.append({
            "symbols": key,
            "opened_at": open_order.get("filled_at"),
            "closed_at": o.get("filled_at"),
            "qty": qty,
            "open_credit": open_price,
            "close_debit": close_price,
            "pnl": pnl,
            "result": "win" if pnl > 0 else "loss" if pnl < 0 else "breakeven",
        })

wins = [t for t in closed_trades if t["pnl"] > 0]
losses = [t for t in closed_trades if t["pnl"] < 0]

total_pnl = sum(t["pnl"] for t in closed_trades)
trade_count = len(closed_trades)
win_rate = (len(wins) / trade_count * 100) if trade_count else None
avg_win = (sum(t["pnl"] for t in wins) / len(wins)) if wins else None
avg_loss = (sum(t["pnl"] for t in losses) / len(losses)) if losses else None

output = {
    "account_type": "Live account",
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "current_equity": float(account["equity"]),
    "points": points,
    "stats": {
        "realized_algo_pnl": total_pnl,
        "closed_trades": trade_count,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": win_rate,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
    },
    "recent_trades": closed_trades[-10:],
    "note": "Trade stats are calculated from filled Alpaca multi-leg option orders by matching opening spreads with closing spreads using the same option legs. Account equity history excludes cashflows where possible, but the chart may still differ from pure strategy returns."
}

with open("data/algo-pnl.json", "w") as f:
    json.dump(output, f, indent=2)

print("Exported data/algo-pnl.json")
print(f"Current equity: ${output['current_equity']:,.2f}")
print(f"Closed trades: {trade_count}")
print(f"Realized algo P&L: ${total_pnl:,.2f}")
print(f"Win rate: {win_rate:.1f}%" if win_rate is not None else "Win rate: N/A")
