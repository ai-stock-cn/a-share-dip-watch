"use strict";

// Tencent's quote endpoint returns GBK text assignments, not JSON. Parse the
// assignment payload as data; never execute it as JavaScript or JSONP.
const LiveMarket = (() => {
  const ENDPOINT = "https://qt.gtimg.cn/";
  const BATCH_SIZE = 80;
  const TIMEOUT_MS = 10_000;
  const FUTURE_TOLERANCE_MS = 60_000;
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
  const CODE_PATTERN = /^[0236]\d{5}$/;
  const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

  function normalizeCodes(codes) {
    if (!Array.isArray(codes)) {
      throw new Error("请提供沪深股票代码数组");
    }
    const unique = new Set();
    for (const value of codes) {
      if (typeof value !== "string" || !CODE_PATTERN.test(value)) {
        throw new Error("股票代码须为以 0、2、3、6 开头的六位字符串，不带市场前缀");
      }
      unique.add(value);
    }
    return [...unique];
  }

  function symbolForCode(code) {
    return `${code.startsWith("6") ? "sh" : "sz"}${code}`;
  }

  function parseNumber(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!NUMBER_PATTERN.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  // Returns an ISO timestamp with an explicit Beijing offset. A previous
  // trading day's timestamp stays unchanged; receiving it today is not a new
  // market update. Return null for rollover dates and implausibly future data.
  function parseQuoteTimestamp(value, nowMs = Date.now()) {
    if (typeof value !== "string" || !/^\d{14}$/.test(value) || !Number.isFinite(nowMs)) {
      return null;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59) {
      return null;
    }
    // setUTCFullYear avoids Date.UTC's special treatment of years 00–99.
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    calendar.setUTCHours(hour, minute, second, 0);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
        calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
        calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
      return null;
    }
    const timestamp = calendar.getTime() - BEIJING_OFFSET_MS;
    if (!Number.isFinite(timestamp) || timestamp > nowMs + FUTURE_TOLERANCE_MS) {
      return null;
    }
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
      `T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  }

  // The requested symbol, assignment symbol and payload's own code must agree.
  // Exposed as a pure helper so response parsing can be reviewed in isolation.
  function parseQuotes(text, codes, { nowMs = Date.now() } = {}) {
    const requested = new Map(normalizeCodes(codes).map((code) => [symbolForCode(code), code]));
    const quotes = {};
    if (typeof text !== "string") return quotes;
    const assignments = /\bv_((?:sh|sz)[0236]\d{5})\s*=\s*"([^"\r\n]*)"/g;
    for (const match of text.matchAll(assignments)) {
      const code = requested.get(match[1]);
      if (!code) continue;
      const fields = match[2].split("~");
      if (fields[2] !== code) continue;
      const name = (fields[1] || "").trim();
      const price = parseNumber(fields[3]);
      const previousClose = parseNumber(fields[4]);
      const quoteTime = parseQuoteTimestamp(fields[30], nowMs);
      if (!name || price === null || price <= 0 || previousClose === null || previousClose <= 0 || !quoteTime) {
        continue;
      }
      const suppliedChange = parseNumber(fields[32]);
      const changePct = suppliedChange ?? ((price - previousClose) / previousClose) * 100;
      if (!Number.isFinite(changePct)) continue;
      const marketCapYi = parseNumber(fields[45]);
      // Keep the newest valid record if an upstream response repeats a symbol.
      if (quotes[code] && quotes[code].quoteTime > quoteTime) continue;
      quotes[code] = { name, price, previousClose, changePct, quoteTime, quoteSource: "live" };
      if (marketCapYi !== null && marketCapYi > 0) {
        quotes[code].marketCapYi = marketCapYi;
      }
    }
    return quotes;
  }

  function abortError() {
    const error = new Error("行情请求已取消");
    error.name = "AbortError";
    return error;
  }

  async function fetchQuotes(codes, { signal } = {}) {
    const requested = normalizeCodes(codes);
    if (signal?.aborted) throw abortError();
    if (requested.length === 0) throw new Error("没有可查询的沪深股票代码");
    const controller = new AbortController();
    const quotes = {};
    const failures = [];
    let timedOut = false;
    let cancelled = false;
    let finished = false;
    let stop;
    const stopped = new Promise((resolve) => { stop = resolve; });
    const onAbort = () => {
      cancelled = true;
      controller.abort();
      stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      stop();
    }, TIMEOUT_MS);

    try {
      const batches = [];
      for (let index = 0; index < requested.length; index += BATCH_SIZE) {
        batches.push(requested.slice(index, index + BATCH_SIZE));
      }
      const pending = batches.map(async (batch, index) => {
        try {
          const url = new URL(ENDPOINT);
          url.searchParams.set("q", batch.map(symbolForCode).join(","));
          url.searchParams.set("_", `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`);
          const response = await fetch(url.toString(), {
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`行情服务返回 HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          const text = new TextDecoder("gb18030", { fatal: true }).decode(buffer);
          const parsed = parseQuotes(text, batch);
          if (!finished && !controller.signal.aborted) Object.assign(quotes, parsed);
        } catch (error) {
          if (!finished && !controller.signal.aborted) {
            failures.push(error instanceof Error ? error.message : "行情请求失败");
          }
        }
      });
      // One deadline covers every batch and response body. A stalled batch
      // cannot discard quotes already returned by other batches.
      await Promise.race([Promise.all(pending), stopped]);
    } finally {
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      controller.abort();
    }

    if (cancelled || signal?.aborted) throw abortError();
    const receivedCount = Object.keys(quotes).length;
    if (receivedCount === 0) {
      if (timedOut) throw new Error("实时行情请求超过 10 秒，未获得有效行情，请稍后重试");
      const detail = failures.length ? `（${failures[0]}）` : "（股票代码、价格或行情时间无效，或上游没有返回记录）";
      throw new Error(`暂未获得有效实时行情${detail}`);
    }
    return { quotes, failedCount: requested.length - receivedCount };
  }

  return Object.freeze({ fetchQuotes, parseQuotes, parseQuoteTimestamp });
})();
