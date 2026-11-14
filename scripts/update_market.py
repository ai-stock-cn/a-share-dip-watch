#!/usr/bin/env python3
"""Refresh the static A-share quote and dividend dataset used by GitHub Pages."""

from __future__ import annotations

import http.cookiejar
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import (
    ThreadPoolExecutor,
    TimeoutError as FuturesTimeoutError,
    as_completed,
)
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import fmean, pstdev
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MARKET_PATH = DATA_DIR / "market.json"
DIVIDEND_PATH = DATA_DIR / "dividends.json"
CODES_PATH = DATA_DIR / "codes.json"
ENTERPRISE_NATURES_PATH = DATA_DIR / "enterprise_natures.json"
EXPECTED_UNIVERSE_SIZE = 309
HISTORY_LIMIT = 520
WEEKLY_HISTORY_LIMIT = 600
HISTORICAL_DIVIDEND_YEARS = 10
BOLL_PERIOD = 20
BOLL_STD_MULTIPLIER = 2
BOLL_BASIS = "day_month_tencent_week_xueqiu_qfq_v1"
GAP_HISTORY_LIMIT = 250
GAP_BASIS = "qfq_daily_ohlc_v3"
MA250_PERIOD = 250
DIVIDEND_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
RECENT_ANNUAL_RANGE_BASIS = "qfq_daily_low_high_v2"
RECENT_ANNUAL_RANGE_HISTORY_LIMIT = 1000
RECENT_ANNUAL_RANGE_MAX_AGE_SECONDS = 60 * 60
RECENT_ANNUAL_RANGE_TIMEOUT_SECONDS = 12
RECENT_ANNUAL_RANGE_BATCH_SECONDS = 90
USER_AGENT = "Mozilla/5.0 (compatible; AShareDipWatch/1.0; +https://github.com/)"
XUEQIU_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/139.0.0.0 Safari/537.36"
)


def request_json(
    url: str,
    params: dict[str, object],
    retries: int = 4,
    referer: str = "https://quote.eastmoney.com/",
) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT, "Referer": referer},
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


def fetch_xueqiu_cookie_header() -> str:
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar)
    )
    request = urllib.request.Request(
        "https://xueqiu.com/",
        headers={
            "User-Agent": XUEQIU_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with opener.open(request, timeout=35) as response:
        response.read()
    cookies = [f"{cookie.name}={cookie.value}" for cookie in cookie_jar]
    if not any(cookie.name == "xq_a_token" for cookie in cookie_jar):
        raise RuntimeError("Xueqiu access token was not issued")
    return "; ".join(cookies)


def request_text(
    url: str,
    params: dict[str, object],
    encoding: str,
    retries: int = 4,
    timeout: float = 35,
) -> str:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": USER_AGENT, "Referer": "https://gu.qq.com/"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read().decode(encoding, errors="replace")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("request failed")


def load_universe() -> list[dict[str, str]]:
    payload = json.loads(CODES_PATH.read_text(encoding="utf-8"))
    nature_groups = json.loads(ENTERPRISE_NATURES_PATH.read_text(encoding="utf-8"))
    enterprise_natures: dict[str, str] = {}
    for nature, codes in nature_groups.items():
        if not isinstance(nature, str) or not nature.strip() or not isinstance(codes, list):
            raise RuntimeError(f"invalid enterprise nature group: {nature!r}")
        for code in codes:
            if code in enterprise_natures:
                raise RuntimeError(f"duplicate enterprise nature entry: {code}")
            enterprise_natures[code] = nature.strip()
    universe: dict[str, dict[str, str]] = {}
    for item in payload:
        code = str(item.get("code", ""))
        name = str(item.get("name", "")).strip()
        industry = str(item.get("industry", "")).strip()
        industry_detail = str(item.get("industryDetail", "")).strip()
        if (
            not re.fullmatch(r"[0236]\d{5}", code)
            or not name
            or not industry
            or not industry_detail
        ):
            raise RuntimeError(f"invalid stock entry: {item!r}")
        universe[code] = {
            "code": code,
            "name": name,
            "category": str(item.get("category", "")),
            "industry": industry,
            "industryDetail": industry_detail,
            "enterpriseNature": enterprise_natures.get(code, ""),
        }
    if len(universe) != EXPECTED_UNIVERSE_SIZE:
        raise RuntimeError(
            f"stock universe must contain {EXPECTED_UNIVERSE_SIZE} rows, "
            f"found {len(universe)}"
        )
    missing_natures = sorted(set(universe) - set(enterprise_natures))
    unknown_natures = sorted(set(enterprise_natures) - set(universe))
    if missing_natures or unknown_natures:
        raise RuntimeError(
            "enterprise nature coverage mismatch: "
            f"missing={missing_natures}, unknown={unknown_natures}"
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
            "industry": item["industry"],
            "industryDetail": item["industryDetail"] or item["industry"],
            "enterpriseNature": item["enterpriseNature"],
            "price": None,
            "marketCapYi": None,
            "changePct": None,
            "quoteTime": None,
            "quoteSource": "snapshot",
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
            if len(fields) < 46:
                continue
            code = fields[2]
            if code not in stocks:
                continue
            price = number_or_none(fields[3])
            market_cap_yi = number_or_none(fields[45])
            change_pct = number_or_none(fields[32])
            quote_time = None
            try:
                quote_time = datetime.strptime(fields[30], "%Y%m%d%H%M%S").replace(
                    tzinfo=ZoneInfo("Asia/Shanghai")
                )
                quote_times.append(quote_time)
            except ValueError:
                pass
            stocks[code] = {
                "name": stocks[code]["name"],
                "industry": stocks[code]["industry"],
                "industryDetail": stocks[code]["industryDetail"],
                "enterpriseNature": stocks[code]["enterpriseNature"],
                "price": price,
                "marketCapYi": market_cap_yi if market_cap_yi and market_cap_yi > 0 else None,
                "changePct": change_pct,
                "quoteTime": quote_time.isoformat() if quote_time else None,
                "quoteSource": "snapshot",
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


def fetch_three_month_metrics(
    stocks: dict[str, dict], quote_timestamp: datetime | None
) -> dict[str, dict]:
    quote_day = (
        quote_timestamp.date()
        if quote_timestamp
        else datetime.now(ZoneInfo("Asia/Shanghai")).date()
    )
    history_inputs = load_history_inputs_from_cache(sorted(stocks), quote_day.isoformat())
    annual_low_cache = load_annual_low_cache(sorted(stocks))
    missing_codes = [code for code in sorted(stocks) if code not in history_inputs]

    if missing_codes:
        xueqiu_cookie_header = None
        try:
            xueqiu_cookie_header = fetch_xueqiu_cookie_header()
            print("Xueqiu weekly BOLL source: ready", flush=True)
        except Exception as error:
            print(
                f"Xueqiu weekly BOLL warning: {error}; using daily aggregation",
                flush=True,
            )
        completed = 0
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(
                    fetch_history_input,
                    code,
                    quote_day,
                    annual_low_cache.get(code),
                    xueqiu_cookie_header,
                ): code
                for code in missing_codes
            }
            for future in as_completed(futures):
                code = futures[future]
                completed += 1
                try:
                    history_inputs[code] = future.result()
                except Exception as error:
                    print(f"History warning for {code}: {error}", flush=True)
                if completed % 10 == 0 or completed == len(missing_codes):
                    print(
                        f"History progress: {completed} requested, "
                        f"{len(history_inputs)} available",
                        flush=True,
                    )

        xueqiu_count = sum(
            history.get("bollWeekSource") == "xueqiu_qfq_week"
            for history in history_inputs.values()
        )
        print(
            f"Weekly BOLL precision: {xueqiu_count} of "
            f"{len(history_inputs)} rows from Xueqiu",
            flush=True,
        )

    minimum_histories = (len(stocks) * 90 + 99) // 100
    if len(history_inputs) < minimum_histories:
        raise RuntimeError(
            f"history response is incomplete: {len(history_inputs)} of "
            f"{len(stocks)} rows"
        )

    metrics: dict[str, dict] = {}
    for code, history in history_inputs.items():
        baseline_close = number_or_none(history.get("threeMonthBaseClose"))
        if baseline_close is None:
            continue
        current_price = number_or_none(stocks[code].get("price"))
        boll_bands = normalize_boll_bands(history.get("bollBands")) or {}
        boll_tracks = boll_tracks_from_bands(current_price, boll_bands)
        three_month_change = (
            (current_price / baseline_close - 1) * 100
            if current_price is not None and baseline_close > 0
            else None
        )
        price_low_1y = number_or_none(history.get("priceLow1y"))
        price_high_1y = number_or_none(history.get("priceHigh1y"))
        price_track_position = None
        price_track_band = None
        if (
            current_price is not None
            and price_low_1y is not None
            and price_high_1y is not None
            and price_high_1y > price_low_1y
        ):
            price_track_position = max(
                0.0,
                min(
                    100.0,
                    (current_price - price_low_1y)
                    / (price_high_1y - price_low_1y)
                    * 100,
                ),
            )
            if price_track_position < 33.3333:
                price_track_band = "low"
            elif price_track_position < 66.6667:
                price_track_band = "middle"
            else:
                price_track_band = "high"
        metrics[code] = {
            "threeMonthChangePct": (
                round(three_month_change, 4)
                if three_month_change is not None
                else None
            ),
            "maxDailyDecline3m": history["maxDailyDecline3m"],
            "threeMonthBaseClose": baseline_close,
            "priceLow1y": price_low_1y,
            "priceHigh1y": price_high_1y,
            "priceTrackPosition1y": (
                round(price_track_position, 2)
                if price_track_position is not None
                else None
            ),
            "priceTrackBand1y": price_track_band,
            "bollBands": boll_bands,
            "bollTracks": boll_tracks,
            "bollBasis": history.get("bollBasis"),
            "bollWeekSource": history.get("bollWeekSource"),
            "ma250": number_or_none(history.get("ma250")),
            "recentGap": normalize_recent_gap(history.get("recentGap")),
            "gapBasis": history.get("gapBasis"),
            "annualLowPrices10y": history.get("annualLowPrices10y") or {},
            "historyAsOf": history["historyAsOf"],
        }
    return metrics


def normalize_boll_bands(payload: object) -> dict[str, dict[str, float]] | None:
    if not isinstance(payload, dict):
        return None
    normalized: dict[str, dict[str, float]] = {}
    for period in ("day", "week", "month"):
        values = payload.get(period)
        if not isinstance(values, dict):
            return None
        lower = number_or_none(values.get("lower"))
        middle = number_or_none(values.get("middle"))
        upper = number_or_none(values.get("upper"))
        if lower is None or middle is None or upper is None:
            return None
        normalized[period] = {
            "lower": lower,
            "middle": middle,
            "upper": upper,
        }
    return normalized


def normalize_recent_gap(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return None
    direction = payload.get("direction")
    lower = number_or_none(payload.get("lower"))
    upper = number_or_none(payload.get("upper"))
    formed_date = payload.get("date")
    filled = payload.get("filled")
    filled_date = payload.get("filledDate")
    as_of = payload.get("asOf")
    if (
        direction not in {"up", "down"}
        or lower is None
        or upper is None
        or lower <= 0
        or upper <= lower
        or not isinstance(formed_date, str)
        or not isinstance(filled, bool)
        or not isinstance(as_of, str)
    ):
        return None
    try:
        formed_day = datetime.strptime(formed_date, "%Y-%m-%d").date()
        as_of_day = datetime.strptime(as_of, "%Y-%m-%d").date()
        if formed_day > as_of_day:
            return None
        if filled:
            fill_day = datetime.strptime(str(filled_date), "%Y-%m-%d").date()
            if fill_day <= formed_day or fill_day > as_of_day:
                return None
        elif filled_date is not None:
            return None
    except (TypeError, ValueError):
        return None
    return {
        "direction": direction,
        "lower": round(lower, 4),
        "upper": round(upper, 4),
        "date": formed_date,
        "filled": filled,
        "filledDate": filled_date if filled else None,
        "asOf": as_of,
    }


def boll_tracks_from_bands(
    current_price: float | None,
    boll_bands: dict[str, dict[str, float]],
) -> dict[str, dict]:
    if current_price is None:
        return {}
    tracks: dict[str, dict] = {}
    for period, values in boll_bands.items():
        lower = values["lower"]
        middle = values["middle"]
        upper = values["upper"]
        if upper <= lower:
            continue
        position = (current_price - lower) / (upper - lower) * 100
        if position < 33.3333:
            band = "lower"
        elif position < 66.6667:
            band = "middle"
        else:
            band = "upper"
        tracks[period] = {
            "band": band,
            "positionPct": round(position, 2),
            "lower": round(lower, 4),
            "middle": round(middle, 4),
            "upper": round(upper, 4),
        }
    return tracks


def load_history_inputs_from_cache(
    codes: list[str], quote_day: str
) -> dict[str, dict]:
    if not MARKET_PATH.exists():
        return {}
    try:
        payload = json.loads(MARKET_PATH.read_text(encoding="utf-8"))
        cached_stocks = payload.get("stocks") or {}
        cached: dict[str, dict] = {}
        for code in codes:
            stock = cached_stocks.get(code) or {}
            baseline = number_or_none(stock.get("threeMonthBaseClose"))
            price_low = number_or_none(stock.get("priceLow1y"))
            price_high = number_or_none(stock.get("priceHigh1y"))
            annual_lows = stock.get("annualLowPrices10y")
            boll_bands = normalize_boll_bands(stock.get("bollBands"))
            ma250 = number_or_none(stock.get("ma250"))
            raw_gap = stock.get("recentGap")
            recent_gap = normalize_recent_gap(raw_gap)
            if (
                stock.get("historyAsOf") != quote_day
                or stock.get("bollBasis") != BOLL_BASIS
                or stock.get("gapBasis") != GAP_BASIS
                or baseline is None
                or price_low is None
                or price_high is None
                or not isinstance(annual_lows, dict)
                or not annual_lows
                or boll_bands is None
                or ma250 is None
                or (raw_gap is not None and recent_gap is None)
            ):
                continue
            cached[code] = {
                "threeMonthBaseClose": baseline,
                "maxDailyDecline3m": number_or_none(
                    stock.get("maxDailyDecline3m")
                ),
                "priceLow1y": price_low,
                "priceHigh1y": price_high,
                "bollBands": boll_bands,
                "bollBasis": BOLL_BASIS,
                "bollWeekSource": stock.get("bollWeekSource"),
                "ma250": ma250,
                "recentGap": recent_gap,
                "gapBasis": GAP_BASIS,
                "annualLowPrices10y": {
                    str(year): float(value)
                    for year, value in annual_lows.items()
                    if number_or_none(value) is not None
                },
                "historyAsOf": quote_day,
            }
        if cached:
            print(f"History cache: {len(cached)} of {len(codes)} rows", flush=True)
        return cached
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return {}


def load_annual_low_cache(codes: list[str]) -> dict[str, dict[str, float]]:
    if not MARKET_PATH.exists():
        return {}
    try:
        payload = json.loads(MARKET_PATH.read_text(encoding="utf-8"))
        cached_stocks = payload.get("stocks") or {}
        cached: dict[str, dict[str, float]] = {}
        for code in codes:
            annual_lows = (cached_stocks.get(code) or {}).get("annualLowPrices10y")
            if not isinstance(annual_lows, dict) or not annual_lows:
                continue
            cached[code] = {
                str(year): float(value)
                for year, value in annual_lows.items()
                if number_or_none(value) is not None
            }
        return cached
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return {}


def fetch_history_input(
    code: str,
    quote_day,
    cached_annual_lows: dict[str, float] | None = None,
    xueqiu_cookie_header: str | None = None,
) -> dict:
    symbol = f"sh{code}" if code.startswith("6") else f"sz{code}"
    recent_gap = None
    gap_basis = None
    try:
        payload = request_json(
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
            {"param": f"{symbol},day,,,{HISTORY_LIMIT},qfq"},
            retries=1,
            referer="https://gu.qq.com/",
        )
        stock_payload = (payload.get("data") or {}).get(symbol) or {}
        qfq_lines = stock_payload.get("qfqday") or []
        lines = qfq_lines or stock_payload.get("day") or []
        closes = history_closes_from_tencent(lines)
        if len(closes) < 3:
            raise RuntimeError("insufficient Tencent K-line rows")
        if qfq_lines:
            recent_gap = recent_gap_from_tencent_lines(qfq_lines)
            gap_basis = GAP_BASIS
    except Exception:
        closes = fetch_sina_history_closes(symbol)

    weekly_closes = None
    week_source = "daily_qfq_aggregate"
    if xueqiu_cookie_header:
        try:
            weekly_closes = fetch_xueqiu_weekly_closes(
                code, quote_day, xueqiu_cookie_header
            )
            week_source = "xueqiu_qfq_week"
        except Exception:
            pass

    annual_lows = dict(cached_annual_lows or {})
    if not annual_lows:
        annual_lows = fetch_sina_annual_low_prices(symbol)

    current_year_closes = [
        close for trade_date, close in closes if trade_date.year == quote_day.year
    ]
    if current_year_closes:
        annual_lows[str(quote_day.year)] = round(min(current_year_closes), 4)

    return history_input_from_closes(
        closes,
        quote_day,
        annual_lows,
        weekly_closes=weekly_closes,
        week_source=week_source,
        recent_gap=recent_gap,
        gap_basis=gap_basis,
    )


def fetch_xueqiu_weekly_closes(
    code: str, quote_day, cookie_header: str
) -> list[tuple[datetime, float]]:
    exchange = "SH" if code.startswith("6") else "SZ"
    begin = datetime(
        quote_day.year,
        quote_day.month,
        quote_day.day,
        tzinfo=ZoneInfo("Asia/Shanghai"),
    ) + timedelta(days=1)
    params = {
        "symbol": f"{exchange}{code}",
        "begin": int(begin.timestamp() * 1000),
        "period": "week",
        "type": "before",
        "count": -30,
        "indicator": "kline",
    }
    request = urllib.request.Request(
        "https://stock.xueqiu.com/v5/stock/chart/kline.json?"
        + urllib.parse.urlencode(params),
        headers={
            "User-Agent": XUEQIU_USER_AGENT,
            "Referer": "https://xueqiu.com/",
            "Accept": "application/json, text/plain, */*",
            "Cookie": cookie_header,
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    if payload.get("error_code") not in (None, 0):
        raise RuntimeError(str(payload.get("error_description") or "Xueqiu error"))
    data = payload.get("data") or {}
    columns = data.get("column") or []
    rows = data.get("item") or []
    try:
        timestamp_index = columns.index("timestamp")
        close_index = columns.index("close")
    except ValueError as error:
        raise RuntimeError("invalid Xueqiu K-line columns") from error

    closes: list[tuple[datetime, float]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) <= max(timestamp_index, close_index):
            continue
        timestamp = number_or_none(row[timestamp_index])
        close = number_or_none(row[close_index])
        if timestamp is None or close is None:
            continue
        trade_date = datetime.fromtimestamp(
            timestamp / 1000,
            ZoneInfo("Asia/Shanghai"),
        ).replace(tzinfo=None)
        closes.append((trade_date, close))
    if len(closes) < BOLL_PERIOD:
        raise RuntimeError("insufficient Xueqiu weekly K-line rows")
    return closes


def fetch_xueqiu_daily_price_rows(
    code: str, quote_day, cookie_header: str
) -> list[dict]:
    exchange = "SH" if code.startswith("6") else "SZ"
    begin = datetime(
        quote_day.year,
        quote_day.month,
        quote_day.day,
        tzinfo=ZoneInfo("Asia/Shanghai"),
    ) + timedelta(days=1)
    params = {
        "symbol": f"{exchange}{code}",
        "begin": int(begin.timestamp() * 1000),
        "period": "day",
        "type": "before",
        "count": -RECENT_ANNUAL_RANGE_HISTORY_LIMIT,
        "indicator": "kline",
    }
    request = urllib.request.Request(
        "https://stock.xueqiu.com/v5/stock/chart/kline.json?"
        + urllib.parse.urlencode(params),
        headers={
            "User-Agent": XUEQIU_USER_AGENT,
            "Referer": "https://xueqiu.com/",
            "Accept": "application/json, text/plain, */*",
            "Cookie": cookie_header,
        },
    )
    with urllib.request.urlopen(
        request, timeout=RECENT_ANNUAL_RANGE_TIMEOUT_SECONDS
    ) as response:
        payload = json.load(response)
    if payload.get("error_code") not in (None, 0):
        raise RuntimeError(str(payload.get("error_description") or "Xueqiu error"))
    data = payload.get("data") or {}
    columns = data.get("column") or []
    rows = data.get("item") or []
    try:
        timestamp_index = columns.index("timestamp")
        high_index = columns.index("high")
        low_index = columns.index("low")
    except ValueError as error:
        raise RuntimeError("invalid Xueqiu daily K-line columns") from error

    normalized: list[dict] = []
    for row in rows:
        if not isinstance(row, list) or len(row) <= max(timestamp_index, high_index, low_index):
            continue
        timestamp = number_or_none(row[timestamp_index])
        high = number_or_none(row[high_index])
        low = number_or_none(row[low_index])
        if timestamp is None or high is None or low is None:
            continue
        trade_day = datetime.fromtimestamp(
            timestamp / 1000,
            ZoneInfo("Asia/Shanghai"),
        ).date()
        normalized.append({"day": trade_day.isoformat(), "high": high, "low": low})
    if len(normalized) < 3:
        raise RuntimeError("insufficient Xueqiu front-adjusted daily K-line rows")
    return normalized


def fetch_tencent_qfq_daily_price_rows(code: str, current_year: int) -> list[dict]:
    symbol = f"sh{code}" if code.startswith("6") else f"sz{code}"
    payload = request_json(
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
        {"param": f"{symbol},day,,,{RECENT_ANNUAL_RANGE_HISTORY_LIMIT},qfq"},
        retries=1,
        referer="https://gu.qq.com/",
    )
    stock_payload = (payload.get("data") or {}).get(symbol) or {}
    lines = stock_payload.get("qfqday") or []
    normalized = [
        {"day": str(line[0]), "high": line[3], "low": line[4]}
        for line in lines
        if isinstance(line, list) and len(line) >= 5
    ]
    earliest_year = current_year - 2
    try:
        archive_payload = request_json(
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
            {
                "param": (
                    f"{symbol},day,{earliest_year}-01-01,"
                    f"{earliest_year}-12-31,400,qfq"
                )
            },
            retries=1,
            referer="https://gu.qq.com/",
        )
        archive_stock = (archive_payload.get("data") or {}).get(symbol) or {}
        archive_lines = archive_stock.get("qfqday") or []
        recent_by_day = {
            str(line[0]): line
            for line in lines
            if isinstance(line, list) and len(line) >= 5
        }
        overlap = next(
            (
                (line, recent_by_day[str(line[0])])
                for line in reversed(archive_lines)
                if isinstance(line, list)
                and len(line) >= 5
                and str(line[0]) in recent_by_day
            ),
            None,
        )
        earliest_recent_day = min(recent_by_day, default="")
        if overlap and earliest_recent_day:
            archive_close = number_or_none(overlap[0][2])
            recent_close = number_or_none(overlap[1][2])
            if archive_close and recent_close and archive_close > 0 and recent_close > 0:
                adjustment_factor = recent_close / archive_close
                normalized.extend(
                    {
                        "day": str(line[0]),
                        "high": number_or_none(line[3]) * adjustment_factor,
                        "low": number_or_none(line[4]) * adjustment_factor,
                        "fullYear": True,
                    }
                    for line in archive_lines
                    if isinstance(line, list)
                    and len(line) >= 5
                    and str(line[0]) < earliest_recent_day
                    and number_or_none(line[3]) is not None
                    and number_or_none(line[4]) is not None
                )
    except Exception:
        # The recent response still provides useful partial coverage when the
        # archived-year request is temporarily unavailable.
        pass
    if len(normalized) < 3:
        raise RuntimeError("insufficient Tencent front-adjusted daily K-line rows")
    return normalized


def recent_gap_from_tencent_lines(lines: list) -> dict | None:
    by_day: dict = {}
    for line in lines:
        if not isinstance(line, list) or len(line) < 5:
            continue
        try:
            trade_day = datetime.strptime(str(line[0]), "%Y-%m-%d").date()
        except ValueError:
            continue
        high = number_or_none(line[3])
        low = number_or_none(line[4])
        if (
            high is None
            or low is None
            or not math.isfinite(high)
            or not math.isfinite(low)
            or low <= 0
            or high < low
        ):
            continue
        by_day[trade_day] = (high, low)

    rows = [(trade_day, *values) for trade_day, values in sorted(by_day.items())]
    # Keep one extra prior trading day so a gap formed on the first day of the
    # one-year window can still be compared with the preceding session.
    rows = rows[-(GAP_HISTORY_LIMIT + 1):]
    if len(rows) < 2:
        return None
    as_of = rows[-1][0].isoformat()
    latest_filled_gap = None
    for index in range(len(rows) - 1, 0, -1):
        trade_day, current_high, current_low = rows[index]
        _, previous_high, previous_low = rows[index - 1]
        direction = None
        lower = None
        upper = None
        if round(current_low, 2) > round(previous_high, 2):
            direction = "up"
            lower = previous_high
            upper = current_low
        elif round(current_high, 2) < round(previous_low, 2):
            direction = "down"
            lower = current_high
            upper = previous_low
        if direction is None or lower is None or upper is None:
            continue

        filled_date = None
        for later_day, later_high, later_low in rows[index + 1:]:
            filled = (
                round(later_low, 2) <= round(lower, 2)
                if direction == "up"
                else round(later_high, 2) >= round(upper, 2)
            )
            if filled:
                filled_date = later_day.isoformat()
                break
        gap = {
            "direction": direction,
            "lower": round(lower, 4),
            "upper": round(upper, 4),
            "date": trade_day.isoformat(),
            "filled": filled_date is not None,
            "filledDate": filled_date,
            "asOf": as_of,
        }
        # A newer, already-filled gap must not hide an older gap that remains
        # open. Prefer the most recent outstanding gap and only fall back to
        # the latest filled gap when no unfilled gap exists in the window.
        if filled_date is None:
            return gap
        if latest_filled_gap is None:
            latest_filled_gap = gap
    return latest_filled_gap


def history_closes_from_tencent(lines: list) -> list[tuple[datetime, float]]:
    closes: list[tuple[datetime, float]] = []
    for line in lines:
        if not isinstance(line, list) or len(line) < 3:
            continue
        try:
            trade_date = datetime.strptime(str(line[0]), "%Y-%m-%d")
        except ValueError:
            continue
        close = number_or_none(line[2])
        if close is not None:
            closes.append((trade_date, close))
    return closes


def fetch_sina_history_closes(symbol: str) -> list[tuple[datetime, float]]:
    rows = fetch_sina_history_rows(symbol, scale=240, datalen=HISTORY_LIMIT)
    closes: list[tuple[datetime, float]] = []
    for row in rows:
        try:
            trade_date = datetime.strptime(str(row.get("day")), "%Y-%m-%d")
        except ValueError:
            continue
        close = number_or_none(row.get("close"))
        if close is not None:
            closes.append((trade_date, close))
    if len(closes) < 3:
        raise RuntimeError("insufficient Sina K-line rows")
    return closes


def fetch_sina_annual_low_prices(symbol: str) -> dict[str, float]:
    rows = fetch_sina_history_rows(
        symbol,
        scale=1200,
        datalen=WEEKLY_HISTORY_LIMIT,
    )
    annual_lows: dict[str, float] = {}
    for row in rows:
        try:
            year = str(datetime.strptime(str(row.get("day")), "%Y-%m-%d").year)
        except ValueError:
            continue
        low = number_or_none(row.get("low"))
        if low is None or low <= 0:
            continue
        annual_lows[year] = min(annual_lows.get(year, low), low)
    if not annual_lows:
        raise RuntimeError("insufficient Sina weekly K-line rows")
    return {year: round(value, 4) for year, value in annual_lows.items()}


def fetch_sina_history_rows(
    symbol: str, scale: int, datalen: int, *, retries: int = 4, timeout: float = 35
) -> list[dict]:
    body = request_text(
        f"https://quotes.sina.cn/cn/api/jsonp_v2.php/var_{symbol}=/"
        "CN_MarketDataService.getKLineData",
        {"symbol": symbol, "scale": scale, "ma": "no", "datalen": datalen},
        "utf-8",
        retries=retries,
        timeout=timeout,
    )
    match = re.search(r"=\((\[.*\])\);?\s*$", body, flags=re.DOTALL)
    if not match:
        raise RuntimeError("invalid Sina K-line response")
    rows = json.loads(match.group(1))
    return [row for row in rows if isinstance(row, dict)]


def empty_recent_annual_price_ranges(
    current_year: int, as_of: str | None = None
) -> list[dict]:
    return [
        {
            "year": year,
            "lowPrice": None,
            "lowDate": None,
            "highPrice": None,
            "highDate": None,
            "asOf": as_of,
            "coverage": "missing",
        }
        for year in range(current_year - 2, current_year + 1)
    ]


def recent_annual_price_ranges_from_rows(rows: list[dict], now: datetime) -> list[dict]:
    daily_ranges: dict = {}
    explicit_full_years: set[int] = set()
    for row in rows:
        try:
            trade_day = datetime.strptime(str(row.get("day")), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        low = number_or_none(row.get("low"))
        high = number_or_none(row.get("high"))
        if (trade_day > now.date() or low is None or high is None
                or not math.isfinite(low) or not math.isfinite(high)
                or low <= 0 or high < low):
            continue
        previous = daily_ranges.get(trade_day)
        daily_ranges[trade_day] = {
            "low": min(previous["low"], low) if previous else low,
            "high": max(previous["high"], high) if previous else high,
        }
        if row.get("fullYear") is True:
            explicit_full_years.add(trade_day.year)
    if not daily_ranges:
        raise RuntimeError("no valid front-adjusted daily price ranges")

    earliest_day = min(daily_ranges)
    latest_day = max(daily_ranges)
    ranges = empty_recent_annual_price_ranges(now.year, latest_day.isoformat())
    for entry in ranges:
        year = entry["year"]
        candidates = [
            (day, values["low"], values["high"])
            for day, values in daily_ranges.items()
            if day.year == year
        ]
        if not candidates:
            continue
        # Keep the first occurrence when the same minimum was traded on several days.
        low_day, low, _ = min(candidates, key=lambda item: (item[1], item[0]))
        # Keep the first occurrence when the same maximum was traded on several days.
        high_day, _, high = min(candidates, key=lambda item: (-item[2], item[0]))
        partial = year not in explicit_full_years and (
            earliest_day.year == year or (year < now.year and latest_day.year == year)
        )
        entry.update({
            "lowPrice": round(low, 4),
            "lowDate": low_day.isoformat(),
            "highPrice": round(high, 4),
            "highDate": high_day.isoformat(),
            "coverage": "partial" if partial else "full",
        })
    return ranges


def load_recent_annual_range_cache(codes: list[str], now: datetime) -> tuple[dict, set[str]]:
    cached: dict[str, dict] = {}
    fresh: set[str] = set()
    if not MARKET_PATH.exists():
        return cached, fresh
    try:
        payload = json.loads(MARKET_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return cached, fresh
        cached_stocks = payload.get("stocks") or {}
        if not isinstance(cached_stocks, dict):
            return cached, fresh
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return cached, fresh

    expected_years = set(range(now.year - 2, now.year + 1))
    for code in codes:
        stock = cached_stocks.get(code) or {}
        if (not isinstance(stock, dict)
                or stock.get("recentAnnualPriceRangesBasis") != RECENT_ANNUAL_RANGE_BASIS):
            continue
        rows = stock.get("recentAnnualPriceRanges3y")
        if not isinstance(rows, list):
            continue
        by_year = {}
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get("year"), int)
                    or row["year"] not in expected_years):
                continue
            year = row["year"]
            try:
                as_of = datetime.strptime(str(row.get("asOf")), "%Y-%m-%d").date()
                if as_of > now.date():
                    continue
                if row.get("coverage") == "missing":
                    by_year[year] = {
                        "year": year,
                        "lowPrice": None,
                        "lowDate": None,
                        "highPrice": None,
                        "highDate": None,
                        "asOf": as_of.isoformat(),
                        "coverage": "missing",
                    }
                    continue
                low_day = datetime.strptime(str(row.get("lowDate")), "%Y-%m-%d").date()
                high_day = datetime.strptime(str(row.get("highDate")), "%Y-%m-%d").date()
                low_price = number_or_none(row.get("lowPrice"))
                high_price = number_or_none(row.get("highPrice"))
                if (low_day.year != year or low_day > as_of
                        or high_day.year != year or high_day > as_of
                        or low_price is None or high_price is None
                        or not math.isfinite(low_price) or not math.isfinite(high_price)
                        or low_price <= 0 or high_price < low_price
                        or row.get("coverage") not in {"full", "partial"}):
                    continue
                by_year[year] = {
                    "year": year,
                    "lowPrice": low_price,
                    "lowDate": low_day.isoformat(),
                    "highPrice": high_price,
                    "highDate": high_day.isoformat(),
                    "asOf": as_of.isoformat(),
                    "coverage": row["coverage"],
                }
            except (TypeError, ValueError):
                continue
        if not by_year:
            continue
        updated_at = stock.get("recentAnnualPriceRangesUpdatedAt")
        cached[code] = {
            "recentAnnualPriceRanges3y": [
                by_year.get(entry["year"], entry)
                for entry in empty_recent_annual_price_ranges(now.year)
            ],
            "recentAnnualPriceRangesBasis": RECENT_ANNUAL_RANGE_BASIS,
            "recentAnnualPriceRangesUpdatedAt": updated_at if isinstance(updated_at, str) else None,
        }
        try:
            updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
            if (updated.tzinfo is not None and set(by_year) == expected_years
                    and 0 <= (now - updated).total_seconds() < RECENT_ANNUAL_RANGE_MAX_AGE_SECONDS):
                fresh.add(code)
        except (TypeError, ValueError):
            pass
    return cached, fresh


def fetch_recent_annual_price_ranges(codes: list[str], now: datetime) -> dict[str, dict]:
    cached, fresh = load_recent_annual_range_cache(codes, now)
    results = {
        code: cached.get(code, {
            "recentAnnualPriceRanges3y": empty_recent_annual_price_ranges(now.year),
            "recentAnnualPriceRangesBasis": RECENT_ANNUAL_RANGE_BASIS,
            "recentAnnualPriceRangesUpdatedAt": None,
        })
        for code in codes
    }
    missing_codes = [code for code in codes if code not in fresh]
    if not missing_codes:
        print(f"Annual price range cache: {len(fresh)} of {len(codes)} rows", flush=True)
        return results

    xueqiu_cookie_header = None
    try:
        xueqiu_cookie_header = fetch_xueqiu_cookie_header()
        print("Annual price range source: Xueqiu front-adjusted daily K-line", flush=True)
    except Exception as error:
        print(f"Annual price range source warning: {error}; using Tencent front-adjusted daily K-line",
              flush=True)

    def fetch_one(code: str) -> tuple[list[dict], str]:
        xueqiu_error = None
        if xueqiu_cookie_header:
            try:
                rows = fetch_xueqiu_daily_price_rows(code, now.date(), xueqiu_cookie_header)
                return recent_annual_price_ranges_from_rows(rows, now), "xueqiu"
            except Exception as error:
                xueqiu_error = error
        try:
            rows = fetch_tencent_qfq_daily_price_rows(code, now.year)
            return recent_annual_price_ranges_from_rows(rows, now), "tencent"
        except Exception as error:
            if xueqiu_error is not None:
                raise RuntimeError(f"Xueqiu: {xueqiu_error}; Tencent: {error}") from error
            raise

    executor = ThreadPoolExecutor(max_workers=6)
    futures = {executor.submit(fetch_one, code): code for code in missing_codes}
    refreshed = 0
    source_counts = {"xueqiu": 0, "tencent": 0}
    try:
        for future in as_completed(futures, timeout=RECENT_ANNUAL_RANGE_BATCH_SECONDS):
            code = futures[future]
            try:
                ranges, source = future.result()
                old_as_of = max(
                    (row.get("asOf") or "" for row in results[code]["recentAnnualPriceRanges3y"]),
                    default="",
                )
                if old_as_of and ranges[0]["asOf"] < old_as_of:
                    raise RuntimeError("daily price response is older than cached data")
                old_by_year = {
                    entry["year"]: entry
                    for entry in results[code]["recentAnnualPriceRanges3y"]
                }
                coverage_rank = {"missing": 0, "partial": 1, "full": 2}
                retained_years = []
                for index, entry in enumerate(ranges):
                    previous = old_by_year.get(entry["year"])
                    if (previous is not None
                            and coverage_rank[previous["coverage"]]
                            > coverage_rank[entry["coverage"]]):
                        # A shorter response must not erase a complete annual range.
                        # Preserve the original data date along with the cached values.
                        ranges[index] = previous
                        retained_years.append(str(entry["year"]))
                if retained_years:
                    print(f"Annual price range warning for {code}: shorter coverage for "
                          f"{','.join(retained_years)}; keeping original cached dates", flush=True)
                results[code] = {
                    "recentAnnualPriceRanges3y": ranges,
                    "recentAnnualPriceRangesBasis": RECENT_ANNUAL_RANGE_BASIS,
                    "recentAnnualPriceRangesUpdatedAt": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
                }
                refreshed += 1
                source_counts[source] += 1
            except Exception as error:
                print(f"Annual price range warning for {code}: {error}; "
                      "keeping cached or missing data", flush=True)
    except FuturesTimeoutError:
        print("Annual price range warning: batch deadline reached; "
              "keeping remaining cached data", flush=True)
    finally:
        # Cancel queued requests; only up to six already-running, bounded requests remain.
        executor.shutdown(wait=True, cancel_futures=True)
    print(f"Annual price ranges: {refreshed} refreshed, {len(fresh)} fresh cached, "
          f"{len(codes) - refreshed - len(fresh)} retained or missing; "
          f"{source_counts['xueqiu']} Xueqiu, {source_counts['tencent']} Tencent",
          flush=True)
    return results


def history_input_from_closes(
    closes: list[tuple[datetime, float]],
    quote_day,
    annual_lows: dict[str, float],
    *,
    weekly_closes: list[tuple[datetime, float]] | None = None,
    week_source: str = "daily_qfq_aggregate",
    recent_gap: dict | None = None,
    gap_basis: str | None = None,
) -> dict:

    closes.sort(key=lambda row: row[0])
    if len(closes) < 3:
        raise RuntimeError("insufficient K-line rows")

    latest_date = closes[-1][0]
    cutoff = latest_date - timedelta(days=92)
    period_rows = [row for row in closes if row[0] >= cutoff]
    if len(period_rows) < 2:
        raise RuntimeError("insufficient three-month rows")

    one_year_cutoff = latest_date - timedelta(days=370)
    one_year_rows = [row for row in closes if row[0] >= one_year_cutoff]
    if len(one_year_rows) < 20:
        raise RuntimeError("insufficient one-year rows")

    daily_changes = [
        (closes[index][0], (closes[index][1] / closes[index - 1][1] - 1) * 100)
        for index in range(1, len(closes))
    ]
    prior_declines = [
        change
        for trade_date, change in daily_changes
        if trade_date.date() < quote_day and trade_date >= cutoff and change < 0
    ]
    boll_bands = calculate_boll_bands(closes, weekly_closes)
    if len(boll_bands) != 3:
        raise RuntimeError("insufficient BOLL history rows")
    if len(closes) < MA250_PERIOD:
        raise RuntimeError("insufficient MA250 history rows")
    ma250 = fmean(close for _, close in closes[-MA250_PERIOD:])
    return {
        "threeMonthBaseClose": period_rows[0][1],
        "maxDailyDecline3m": (
            round(min(prior_declines), 4) if prior_declines else None
        ),
        "priceLow1y": round(min(close for _, close in one_year_rows), 4),
        "priceHigh1y": round(max(close for _, close in one_year_rows), 4),
        "bollBands": boll_bands,
        "bollBasis": BOLL_BASIS,
        "bollWeekSource": week_source,
        "ma250": round(ma250, 4),
        "recentGap": normalize_recent_gap(recent_gap),
        "gapBasis": gap_basis,
        "annualLowPrices10y": annual_lows,
        "historyAsOf": quote_day.isoformat(),
    }


def calculate_boll_bands(
    closes: list[tuple[datetime, float]],
    weekly_closes: list[tuple[datetime, float]] | None = None,
) -> dict[str, dict[str, float]]:
    values_by_period = {
        "day": [close for _, close in closes],
        "week": (
            [close for _, close in sorted(weekly_closes)]
            if weekly_closes
            else aggregate_period_closes(closes, "week")
        ),
        "month": aggregate_period_closes(closes, "month"),
    }
    bands: dict[str, dict[str, float]] = {}
    for period, values in values_by_period.items():
        calculated = boll_bands_from_values(values)
        if calculated is not None:
            bands[period] = calculated
    return bands


def aggregate_period_closes(
    closes: list[tuple[datetime, float]], period: str
) -> list[float]:
    grouped: dict[tuple[int, int], float] = {}
    for trade_date, close in closes:
        if period == "week":
            iso_year, iso_week, _ = trade_date.isocalendar()
            key = (iso_year, iso_week)
        else:
            key = (trade_date.year, trade_date.month)
        grouped[key] = close
    return list(grouped.values())


def boll_bands_from_values(values: list[float]) -> dict[str, float] | None:
    if len(values) < BOLL_PERIOD:
        return None
    window = values[-BOLL_PERIOD:]
    middle = fmean(window)
    deviation = pstdev(window)
    distance = BOLL_STD_MULTIPLIER * deviation
    return {
        "lower": round(middle - distance, 4),
        "middle": round(middle, 4),
        "upper": round(middle + distance, 4),
    }


def load_fresh_dividend_cache(
    fiscal_year: int, codes: list[str]
) -> tuple[dict[str, float], dict[str, dict[str, float]]] | None:
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
            annual_payload = payload.get("annualDividends")
            if not isinstance(annual_payload, dict):
                return None
            totals = {
                key: float(value) for key, value in payload["dividends"].items()
            }
            annual = {
                code: {
                    str(year): float(value)
                    for year, value in years.items()
                }
                for code, years in annual_payload.items()
                if isinstance(years, dict)
            }
            return totals, annual
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def fetch_dividends(
    fiscal_year: int, codes: list[str]
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    cached = load_fresh_dividend_cache(fiscal_year, codes)
    if cached is not None:
        return cached

    totals: dict[str, float] = {code: 0.0 for code in codes}
    annual: dict[str, dict[str, float]] = {code: {} for code in codes}
    target_years = set(
        range(
            fiscal_year - HISTORICAL_DIVIDEND_YEARS + 1,
            fiscal_year + 1,
        )
    )
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
            if year not in target_years:
                continue
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
            dividend_per_share = cash_per_ten / 10
            year_key = str(year)
            annual.setdefault(code, {})[year_key] = (
                annual.get(code, {}).get(year_key, 0.0) + dividend_per_share
            )
            if year == fiscal_year:
                found_target_year = True
                totals[code] = totals.get(code, 0.0) + dividend_per_share

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
            "annualDividends": {
                code: {
                    year: round(value, 8)
                    for year, value in sorted(years.items())
                }
                for code, years in sorted(annual.items())
            },
        },
    )
    return totals, annual


def calculate_historical_max_dividend_yield(
    annual_dividends: dict[str, float],
    annual_low_prices: dict[str, float],
    fiscal_year: int,
) -> tuple[float | None, int | None, float | None, float | None]:
    best_yield = None
    best_year = None
    best_price = None
    best_dividend = None
    first_year = fiscal_year - HISTORICAL_DIVIDEND_YEARS + 1
    for year in range(first_year, fiscal_year + 1):
        dividend = number_or_none(annual_dividends.get(str(year)))
        next_year_low = number_or_none(annual_low_prices.get(str(year + 1)))
        if dividend is None or dividend <= 0 or next_year_low is None or next_year_low <= 0:
            continue
        dividend_yield = dividend / next_year_low * 100
        if best_yield is None or dividend_yield > best_yield:
            best_yield = dividend_yield
            best_year = year
            best_price = next_year_low
            best_dividend = dividend
    return (
        round(best_yield, 4) if best_yield is not None else None,
        best_year,
        round(best_price, 4) if best_price is not None else None,
        round(best_dividend, 8) if best_dividend is not None else None,
    )


def calculate_consecutive_dividend_years(
    annual_dividends: dict[str, float], fiscal_year: int
) -> int:
    consecutive_years = 0
    first_year = fiscal_year - HISTORICAL_DIVIDEND_YEARS + 1
    for year in range(fiscal_year, first_year - 1, -1):
        dividend = number_or_none(annual_dividends.get(str(year)))
        if dividend is None or dividend <= 0:
            break
        consecutive_years += 1
    return consecutive_years


def calculate_recent_dividend_yields(
    annual_dividends: dict[str, float],
    annual_low_prices: dict[str, float],
    current_year: int,
) -> list[dict]:
    yields: list[dict] = []
    for year in range(current_year - 2, current_year + 1):
        dividend_year = year - 1
        dividend = number_or_none(annual_dividends.get(str(dividend_year)))
        annual_low = number_or_none(annual_low_prices.get(str(year)))
        dividend_yield = None
        price_used = None
        dividend_used = None
        if (
            dividend is not None
            and dividend > 0
            and annual_low is not None
            and annual_low > 0
        ):
            dividend_yield = round(dividend / annual_low * 100, 4)
            price_used = round(annual_low, 4)
            dividend_used = round(dividend, 8)
        yields.append(
            {
                "year": year,
                "dividendYear": dividend_year,
                "yieldPct": dividend_yield,
                "priceUsed": price_used,
                "dividendPerShare": dividend_used,
            }
        )
    return yields


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
    histories = fetch_three_month_metrics(stocks, quote_timestamp)
    dividends, annual_dividends = fetch_dividends(fiscal_year, codes)
    recent_annual_ranges = fetch_recent_annual_price_ranges(codes, now)

    for code, stock in stocks.items():
        stock["dividendPerShare"] = round(dividends.get(code, 0.0), 8)
        stock["dividendYear"] = fiscal_year
        history = histories.get(
            code,
            {"threeMonthChangePct": None, "maxDailyDecline3m": None},
        )
        stock.update(history)
        stock.update(recent_annual_ranges[code])
        stock["consecutiveDividendYears"] = calculate_consecutive_dividend_years(
            annual_dividends.get(code, {}), fiscal_year
        )
        (
            historical_yield,
            historical_year,
            historical_price,
            historical_dividend,
        ) = calculate_historical_max_dividend_yield(
            annual_dividends.get(code, {}),
            history.get("annualLowPrices10y") or {},
            fiscal_year,
        )
        stock["historicalMaxDividendYield10y"] = historical_yield
        stock["historicalMaxDividendYear"] = historical_year
        stock["historicalMaxDividendPrice"] = historical_price
        stock["historicalMaxDividendPerShare"] = historical_dividend
        stock["recentDividendYields3y"] = calculate_recent_dividend_yields(
            annual_dividends.get(code, {}),
            history.get("annualLowPrices10y") or {},
            now.year,
        )

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
