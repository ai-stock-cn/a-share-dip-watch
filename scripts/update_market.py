#!/usr/bin/env python3
"""Refresh the static A-share quote and dividend dataset used by GitHub Pages."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MARKET_PATH = DATA_DIR / "market.json"
DIVIDEND_PATH = DATA_DIR / "dividends.json"
CODES_PATH = DATA_DIR / "codes.json"
EXPECTED_UNIVERSE_SIZE = 43
DIVIDEND_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
USER_AGENT = "Mozilla/5.0 (compatible; AShareDipWatch/1.0; +https://github.com/)"


def request_json(url: str, params: dict[str, object], retries: int = 4) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT, "Referer": "https://quote.eastmoney.com/"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("request failed")


def request_text(
    url: str, params: dict[str, object], encoding: str, retries: int = 4
) -> str:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT, "Referer": "https://gu.qq.com/"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return response.read().decode(encoding, errors="replace")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("request failed")


def load_universe() -> list[dict[str, str]]:
    payload = json.loads(CODES_PATH.read_text(encoding="utf-8"))
    universe: dict[str, dict[str, str]] = {}
    for item in payload:
        code = str(item.get("code", ""))
        name = str(item.get("name", "")).strip()
        if not re.fullmatch(r"[0236]\d{5}", code) or not name:
            raise RuntimeError(f"invalid stock entry: {item!r}")
        universe[code] = {
            "code": code,
            "name": name,
            "category": str(item.get("category", "")),
        }
    if len(universe) != EXPECTED_UNIVERSE_SIZE:
        raise RuntimeError(
            f"stock universe must contain {EXPECTED_UNIVERSE_SIZE} rows, "
            f"found {len(universe)}"
        )
    return [universe[code] for code in sorted(universe)]


def fetch_quotes(
    universe: list[dict[str, str]],
) -> tuple[dict[str, dict], datetime | None]:
    codes = [item["code"] for item in universe]
    chunk_size = 200
    stocks: dict[str, dict] = {
        item["code"]: {
            "name": item["name"],
            "price": None,
            "changePct": None,
        }
        for item in universe
    }
    quoted_codes: set[str] = set()
    quote_times: list[datetime] = []
    for offset in range(0, len(codes), chunk_size):
        chunk = codes[offset : offset + chunk_size]
        symbols = [f"sh{code}" if code.startswith("6") else f"sz{code}" for code in chunk]
        body = request_text(
            "https://qt.gtimg.cn/",
            {"q": ",".join(symbols)},
            "gb18030",
        )
        for _symbol, quote in re.findall(r'v_([^=]+)="([^"]*)";', body):
            fields = quote.split("~")
            if len(fields) < 33:
                continue
            code = fields[2]
            if code not in stocks:
                continue
            price = number_or_none(fields[3])
            change_pct = number_or_none(fields[32])
            try:
                quote_time = datetime.strptime(fields[30], "%Y%m%d%H%M%S").replace(
                    tzinfo=ZoneInfo("Asia/Shanghai")
                )
                quote_times.append(quote_time)
            except ValueError:
                pass
            stocks[code] = {
                "name": fields[1] or stocks[code]["name"],
                "price": price,
                "changePct": change_pct,
            }
            quoted_codes.add(code)
        completed = min(offset + chunk_size, len(codes))
        print(
            f"Quote progress: {completed} codes, {len(quoted_codes)} quotes",
            flush=True,
        )
        time.sleep(0.4)

    minimum_quotes = (len(codes) * 95 + 99) // 100
    if len(quoted_codes) < minimum_quotes:
        raise RuntimeError(
            f"quote response is incomplete: {len(quoted_codes)} of {len(codes)} rows"
        )
    return stocks, max(quote_times, default=None)


def load_fresh_dividend_cache(
    fiscal_year: int, codes: list[str]
) -> dict[str, float] | None:
    if not DIVIDEND_PATH.exists():
        return None
    try:
        payload = json.loads(DIVIDEND_PATH.read_text(encoding="utf-8"))
        generated_at = datetime.fromisoformat(payload["generatedAt"])
        age = datetime.now(timezone.utc).timestamp() - generated_at.timestamp()
        if (
            payload.get("fiscalYear") == fiscal_year
            and payload.get("codes") == codes
            and age < DIVIDEND_MAX_AGE_SECONDS
        ):
            return {key: float(value) for key, value in payload["dividends"].items()}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def fetch_dividends(fiscal_year: int, codes: list[str]) -> dict[str, float]:
    cached = load_fresh_dividend_cache(fiscal_year, codes)
    if cached is not None:
        return cached

    totals: dict[str, float] = {code: 0.0 for code in codes}
    seen: set[tuple[str, str, str, str]] = set()
    found_target_year = False

    for index, requested_code in enumerate(codes, start=1):
        payload = request_json(
            "https://datacenter-web.eastmoney.com/api/data/v1/get",
            {
                "sortColumns": "REPORT_DATE",
                "sortTypes": -1,
                "pageSize": 100,
                "pageNumber": 1,
                "reportName": "RPT_SHAREBONUS_DET",
                "columns": "SECURITY_CODE,REPORT_DATE,PRETAX_BONUS_RMB,IMPL_PLAN_PROFILE,EX_DIVIDEND_DATE",
                "filter": f'(SECURITY_CODE="{requested_code}")',
                "source": "WEB",
                "client": "WEB",
            },
        )
        result = payload.get("result") or {}
        rows = result.get("data") or []
        for row in rows:
            report_date = str(row.get("REPORT_DATE") or "")
            try:
                year = int(report_date[:4])
            except ValueError:
                continue
            if year != fiscal_year:
                continue
            found_target_year = True
            code = str(row.get("SECURITY_CODE") or "")
            cash_per_ten = number_or_none(row.get("PRETAX_BONUS_RMB"))
            if len(code) != 6 or cash_per_ten is None or cash_per_ten <= 0:
                continue
            event_key = (
                code,
                report_date,
                str(cash_per_ten),
                str(row.get("EX_DIVIDEND_DATE") or row.get("IMPL_PLAN_PROFILE") or ""),
            )
            if event_key in seen:
                continue
            seen.add(event_key)
            totals[code] = totals.get(code, 0.0) + cash_per_ten / 10

        if index % 10 == 0 or index == len(codes):
            payers = sum(value > 0 for value in totals.values())
            print(
                f"Dividend progress: {index} codes, {payers} payers",
                flush=True,
            )
        time.sleep(0.25)

    if not found_target_year:
        raise RuntimeError(f"no dividend records found for fiscal year {fiscal_year}")

    generated_at = datetime.now(timezone.utc).isoformat()
    write_json(
        DIVIDEND_PATH,
        {
            "fiscalYear": fiscal_year,
            "generatedAt": generated_at,
            "codes": codes,
            "dividends": {code: round(value, 8) for code, value in sorted(totals.items())},
        },
    )
    return totals


def number_or_none(value: object) -> float | None:
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def integer_or_none(value: object) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def main() -> None:
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    fiscal_year = now.year - 1
    universe = load_universe()
    codes = [item["code"] for item in universe]
    stocks, quote_timestamp = fetch_quotes(universe)
    dividends = fetch_dividends(fiscal_year, codes)

    for code, stock in stocks.items():
        stock["dividendPerShare"] = round(dividends.get(code, 0.0), 8)
        stock["dividendYear"] = fiscal_year

    quote_time = quote_timestamp.isoformat() if quote_timestamp else None
    write_json(
        MARKET_PATH,
        {
            "generatedAt": now.isoformat(),
            "quoteTime": quote_time,
            "dividendYear": fiscal_year,
            "stockCount": len(stocks),
            "stocks": dict(sorted(stocks.items())),
        },
    )
    print(
        f"Updated {MARKET_PATH}: {len(stocks)} stocks, "
        f"{sum(value > 0 for value in dividends.values())} dividend payers, "
        f"fiscal year {fiscal_year}"
    )


if __name__ == "__main__":
    main()
