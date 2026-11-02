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


def load_codes() -> list[str]:
    payload = json.loads(CODES_PATH.read_text(encoding="utf-8"))
    codes = [str(item["code"]) for item in payload if str(item.get("code", ""))[:1] in "0236"]
    if len(codes) < 3000:
        raise RuntimeError(f"stock code list is incomplete: {len(codes)} rows")
    return sorted(set(codes))


def fetch_quotes() -> tuple[dict[str, dict], datetime | None]:
    codes = load_codes()
    chunk_size = 200
    stocks: dict[str, dict] = {}
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
                "name": fields[1] or code,
                "price": price,
                "changePct": change_pct,
            }
        completed = min(offset + chunk_size, len(codes))
        if offset == 0 or completed % 1000 == 0 or completed == len(codes):
            print(f"Quote progress: {completed} codes, {len(stocks)} quotes", flush=True)
        time.sleep(0.4)

    if len(stocks) < max(3000, int(len(codes) * 0.95)):
        raise RuntimeError(
            f"quote response is incomplete: {len(stocks)} of {len(codes)} rows"
        )
    return stocks, max(quote_times, default=None)


def load_fresh_dividend_cache(fiscal_year: int) -> dict[str, float] | None:
    if not DIVIDEND_PATH.exists():
        return None
    try:
        payload = json.loads(DIVIDEND_PATH.read_text(encoding="utf-8"))
        generated_at = datetime.fromisoformat(payload["generatedAt"])
        age = datetime.now(timezone.utc).timestamp() - generated_at.timestamp()
        if payload.get("fiscalYear") == fiscal_year and age < DIVIDEND_MAX_AGE_SECONDS:
            return {key: float(value) for key, value in payload["dividends"].items()}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def fetch_dividends(fiscal_year: int) -> dict[str, float]:
    cached = load_fresh_dividend_cache(fiscal_year)
    if cached is not None:
        return cached

    totals: dict[str, float] = {}
    seen: set[tuple[str, str, str, str]] = set()
    page = 1
    total_pages = None
    found_target_year = False

    while total_pages is None or page <= total_pages:
        payload = request_json(
            "https://datacenter-web.eastmoney.com/api/data/v1/get",
            {
                "sortColumns": "REPORT_DATE",
                "sortTypes": -1,
                "pageSize": 500,
                "pageNumber": page,
                "reportName": "RPT_SHAREBONUS_DET",
                "columns": "SECURITY_CODE,REPORT_DATE,PRETAX_BONUS_RMB,IMPL_PLAN_PROFILE,EX_DIVIDEND_DATE",
                "source": "WEB",
                "client": "WEB",
            },
        )
        result = payload.get("result") or {}
        rows = result.get("data") or []
        total_pages = int(result.get("pages") or 0)
        if not rows:
            break

        row_years: list[int] = []
        for row in rows:
            report_date = str(row.get("REPORT_DATE") or "")
            try:
                year = int(report_date[:4])
            except ValueError:
                continue
            row_years.append(year)
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

        if row_years and max(row_years) < fiscal_year:
            break
        if found_target_year and row_years and min(row_years) < fiscal_year:
            break
        page += 1
        time.sleep(0.35)

    if not found_target_year:
        raise RuntimeError(f"no dividend records found for fiscal year {fiscal_year}")

    generated_at = datetime.now(timezone.utc).isoformat()
    write_json(
        DIVIDEND_PATH,
        {
            "fiscalYear": fiscal_year,
            "generatedAt": generated_at,
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
    stocks, quote_timestamp = fetch_quotes()
    dividends = fetch_dividends(fiscal_year)

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
        f"{len(dividends)} dividend payers, fiscal year {fiscal_year}"
    )


if __name__ == "__main__":
    main()
