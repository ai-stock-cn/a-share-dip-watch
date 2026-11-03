"use strict";

const BASE_CODES = [
  "000001",
  "000333",
  "000423",
  "000538",
  "000651",
  "000807",
  "000895",
  "000933",
  "002032",
  "002142",
  "002508",
  "003816",
  "600011",
  "600028",
  "600036",
  "600050",
  "600406",
  "600690",
  "600750",
  "600795",
  "600863",
  "600886",
  "600887",
  "600900",
  "600919",
  "600938",
  "600941",
  "601009",
  "601088",
  "601166",
  "601229",
  "601288",
  "601318",
  "601328",
  "601398",
  "601728",
  "601838",
  "601857",
  "601899",
  "601939",
  "601985",
  "601988",
  "601998",
  "603288",
];

const BANK_CODES = [
  "000001",
  "001227",
  "002142",
  "002807",
  "002839",
  "002936",
  "002948",
  "002958",
  "002966",
  "600000",
  "600015",
  "600016",
  "600036",
  "600908",
  "600919",
  "600926",
  "600928",
  "601009",
  "601077",
  "601128",
  "601166",
  "601169",
  "601187",
  "601229",
  "601288",
  "601328",
  "601398",
  "601528",
  "601577",
  "601658",
  "601665",
  "601818",
  "601825",
  "601838",
  "601860",
  "601916",
  "601939",
  "601963",
  "601988",
  "601997",
  "601998",
  "603323",
];

const EXTRA_CODES = [
  "000429",
  "000568",
  "000719",
  "000848",
  "000999",
  "001965",
  "002003",
  "002014",
  "002027",
  "002091",
  "002128",
  "002216",
  "002271",
  "002293",
  "002299",
  "002327",
  "002415",
  "002555",
  "002557",
  "002572",
  "002582",
  "002746",
  "002818",
  "002832",
  "002867",
  "002884",
  "300628",
  "300770",
  "600012",
  "600018",
  "600019",
  "600023",
  "600035",
  "600039",
  "600066",
  "600096",
  "600132",
  "600177",
  "600188",
  "600210",
  "600219",
  "600285",
  "600295",
  "600329",
  "600350",
  "600377",
  "600398",
  "600415",
  "600566",
  "600582",
  "600585",
  "600600",
  "600755",
  "600803",
  "601000",
  "601006",
  "601083",
  "601098",
  "601107",
  "601225",
  "601298",
  "601336",
  "601390",
  "601668",
  "601717",
  "601816",
  "601919",
  "601928",
  "603195",
  "603565",
  "603833",
  "603866",
  "605337",
  "605338",
];

const LATEST_ADDED_CODES = [
  "000719",
  "002003",
  "002014",
  "002027",
  "002091",
  "002299",
  "002746",
  "002884",
  "300628",
  "300770",
  "600019",
  "600415",
  "600755",
  "600803",
  "601083",
  "601107",
  "601717",
];

const DEFAULT_CODES = [
  ...new Set([...BASE_CODES, ...BANK_CODES, ...EXTRA_CODES]),
];

const STORAGE_KEYS = {
  watchlist: "a-share-dip-watch:watchlist:v12",
  starred: "a-share-dip-watch:starred:v1",
  previousWatchlist: "a-share-dip-watch:watchlist:v11",
  legacyWatchlists: [
    "a-share-dip-watch:watchlist:v10",
    "a-share-dip-watch:watchlist:v9",
    "a-share-dip-watch:watchlist:v8",
    "a-share-dip-watch:watchlist:v7",
    "a-share-dip-watch:watchlist:v6",
    "a-share-dip-watch:watchlist:v5",
    "a-share-dip-watch:watchlist:v4",
    "a-share-dip-watch:watchlist:v3",
    "a-share-dip-watch:watchlist:v2",
  ],
  market: "a-share-dip-watch:market:v14",
};

const FILTER_META = {
  daily: { title: "今日表现", header: "当日涨跌幅" },
  threeMonth: { title: "近3月表现", header: "近3月涨跌幅" },
  largestDaily: { title: "近3月异常", header: "当日涨跌幅" },
};

const PRICE_TRACK_META = {
  low: { label: "低位", className: "low" },
  middle: { label: "中位", className: "middle" },
  high: { label: "高位", className: "high" },
};

const BOLL_PERIOD_META = {
  day: { shortLabel: "日", label: "日线" },
  week: { shortLabel: "周", label: "周线" },
  month: { shortLabel: "月", label: "月线" },
};

const BOLL_BAND_META = {
  lower: { label: "下轨", className: "lower" },
  middle: { label: "中轨", className: "middle" },
  upper: { label: "上轨", className: "upper" },
};

const TRASH_ICON = `
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />
  </svg>`;

const STAR_ICON = `
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 2.7 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z" />
  </svg>`;

let toastTimer;
let quoteRefreshTimer;
let appInitialized = false;
const SNAPSHOT_REFRESH_MS = 15 * 60 * 1000;
const SHANGHAI_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const elements = {
  addButton: document.querySelector("#addButton"),
  addDialog: document.querySelector("#addDialog"),
  addForm: document.querySelector("#addForm"),
  alertCount: document.querySelector("#alertCount"),
  alertShortcut: document.querySelector("#alertShortcut"),
  bollBandFilter: document.querySelector("#bollBandFilter"),
  bollPeriodFilter: document.querySelector("#bollPeriodFilter"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  changeHeader: document.querySelector("#changeHeader"),
  changeHeaderLabel: document.querySelector("#changeHeaderLabel"),
  changeSortButton: document.querySelector("#changeSortButton"),
  changeSortIcon: document.querySelector("#changeSortIcon"),
  confirmAddButton: document.querySelector("#confirmAddButton"),
  severeDeclineCount: document.querySelector("#severeDeclineCount"),
  severeDeclineShortcut: document.querySelector("#severeDeclineShortcut"),
  enterpriseNatureFilter: document.querySelector("#enterpriseNatureFilter"),
  formError: document.querySelector("#formError"),
  industryFilter: document.querySelector("#industryFilter"),
  ma250Filter: document.querySelector("#ma250Filter"),
  marketStatus: document.querySelector("#marketStatus"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
  pageStatus: document.querySelector("#pageStatus"),
  periodFilter: document.querySelector("#periodFilter"),
  previousPageButton: document.querySelector("#previousPageButton"),
  refreshButton: document.querySelector("#refreshButton"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  resultCount: document.querySelector("#resultCount"),
  sortOrder: document.querySelector("#sortOrder"),
  stockCount: document.querySelector("#stockCount"),
  stockListSearch: document.querySelector("#stockListSearch"),
  starredFilterCount: document.querySelector("#starredFilterCount"),
  starredOnlyFilter: document.querySelector("#starredOnlyFilter"),
  stockQuery: document.querySelector("#stockQuery"),
  stockRows: document.querySelector("#stockRows"),
  stockSuggestionPanel: document.querySelector("#stockSuggestionPanel"),
  thresholdFilter: document.querySelector("#thresholdFilter"),
  twoYearLowFilter: document.querySelector("#twoYearLowFilter"),
  toast: document.querySelector("#toast"),
  updatedAt: document.querySelector("#updatedAt"),
  watchlistSection: document.querySelector("#watchlistSection"),
  watchlistTitle: document.querySelector("#watchlistTitle"),
};

const state = {
  codes: loadWatchlist(),
  market: loadJson(STORAGE_KEYS.market, null),
  loading: false,
  snapshotLoading: false,
  snapshotAttemptAt: 0,
  liveError: "",
  missingQuotes: 0,
  bollBand: "all",
  bollPeriod: "day",
  enterpriseNature: "all",
  industry: "all",
  ma250Position: "all",
  period: "daily",
  threshold: 0,
  twoYearLowRange: "all",
  page: 1,
  pageSize: 50,
  searchQuery: "",
  sortOrder: "decline",
  starredCodes: loadStarredCodes(),
  starredOnly: false,
};

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quotes remain usable when browser storage is unavailable or full.
  }
}

function loadStarredCodes() {
  const saved = loadJson(STORAGE_KEYS.starred, []);
  if (!Array.isArray(saved)) return new Set();
  return new Set(saved.filter((code) => /^\d{6}$/.test(code)));
}

function saveStarredCodes() {
  saveJson(STORAGE_KEYS.starred, [...state.starredCodes].sort());
}

function loadWatchlist() {
  const current = loadJson(STORAGE_KEYS.watchlist, null);
  if (Array.isArray(current)) return current;

  const previous = loadJson(STORAGE_KEYS.previousWatchlist, null);
  if (Array.isArray(previous)) {
    // Add the latest requested stocks once while preserving existing choices.
    const migrated = [...new Set([...previous, ...LATEST_ADDED_CODES])];
    saveJson(STORAGE_KEYS.watchlist, migrated);
    return migrated;
  }

  const legacy =
    STORAGE_KEYS.legacyWatchlists
      .map((key) => loadJson(key, null))
      .find((value) => Array.isArray(value)) || BASE_CODES;
  const migrated = [
    ...new Set([
      ...(Array.isArray(legacy) ? legacy : BASE_CODES),
      ...BASE_CODES,
      ...BANK_CODES,
      ...EXTRA_CODES,
    ]),
  ];
  saveJson(STORAGE_KEYS.watchlist, migrated);
  return migrated;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchMarket() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`./data/market.json?v=${Date.now()}`, {
      cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new Error(`行情文件读取失败 (${response.status})`);
    const data = await response.json();
    if (!data?.stocks || !DEFAULT_CODES.every((code) => data.stocks[code])) {
      throw new Error("行情文件不完整");
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

function stockQuoteTime(stock, market = state.market) {
  if (!(numberOrNull(stock.price) > 0) || numberOrNull(stock.changePct) === null) return null;
  // Older snapshots only have a dataset timestamp; new snapshots store each quote's time.
  const value = Object.hasOwn(stock, "quoteTime") ? stock.quoteTime : market?.quoteTime;
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp <= Date.now() + 60000 ? value : null;
}

function mergeSnapshot(snapshot) {
  if (!snapshot?.stocks) return;
  if (Date.parse(snapshot.generatedAt) < Date.parse(state.market?.generatedAt)) return;
  const stocks = {};
  for (const code of DEFAULT_CODES) {
    const incoming = snapshot.stocks[code];
    if (!incoming) continue;
    const current = state.market?.stocks?.[code];
    const incomingTime = stockQuoteTime(incoming, snapshot);
    const currentTime = current ? stockQuoteTime(current) : null;
    stocks[code] = { ...incoming, quoteTime: incomingTime, quoteSource: incoming.quoteSource || "snapshot" };
    // A slow snapshot download must never roll a live quote back to an older price.
    if (current && Number.isFinite(Date.parse(currentTime)) &&
        (!Number.isFinite(Date.parse(incomingTime)) || Date.parse(currentTime) >= Date.parse(incomingTime))) {
      for (const key of ["price", "changePct", "previousClose", "quoteSource"]) {
        stocks[code][key] = current[key];
      }
      stocks[code].quoteTime = currentTime;
    }
  }
  state.market = { ...snapshot, stocks };
}

async function refreshSnapshot(force = false) {
  if (state.snapshotLoading || (!force && Date.now() - state.snapshotAttemptAt < SNAPSHOT_REFRESH_MS)) return;
  state.snapshotLoading = true;
  state.snapshotAttemptAt = Date.now();
  try {
    mergeSnapshot(await fetchMarket());
    saveJson(STORAGE_KEYS.market, state.market);
  } catch {
    // Historical data failures do not block the independent live quote request.
  } finally {
    state.snapshotLoading = false;
    render();
  }
}

function priceMetrics(stock) {
  const price = numberOrNull(stock.price);
  const base = numberOrNull(stock.threeMonthBaseClose);
  const low = numberOrNull(stock.priceLow1y);
  const high = numberOrNull(stock.priceHigh1y);
  const position = price > 0 && low !== null && high > low
    ? Math.max(0, Math.min(100, (price - low) / (high - low) * 100)) : null;
  const bands = stock.bollBands || stock.bollTracks || {};
  const bollTracks = {};
  for (const [period, band] of Object.entries(bands)) {
    const lower = numberOrNull(band.lower);
    const upper = numberOrNull(band.upper);
    const middle = numberOrNull(band.middle);
    if (price <= 0 || price === null || lower === null || middle === null || upper === null || upper <= lower) continue;
    const positionPct = (price - lower) / (upper - lower) * 100;
    bollTracks[period] = { lower, upper, middle, positionPct,
      band: positionPct < 33.3333 ? "lower" : positionPct < 66.6667 ? "middle" : "upper" };
  }
  return {
    threeMonthChangePct: price > 0 && base > 0 ? (price / base - 1) * 100 : null,
    priceTrackPosition1y: position,
    priceTrackBand1y: position === null ? null : position < 33.3333 ? "low" : position < 66.6667 ? "middle" : "high",
    bollTracks,
  };
}

function quoteFor(code) {
  const stored = state.market?.stocks?.[code];
  if (!stored) return null;
  const stock = { ...stored, ...priceMetrics(stored) };
  const annualLows = normalizeAnnualLowPrices(stock);
  return {
    code,
    name: stock.name || code,
    industry: stock.industry || "行业待同步",
    industryDetail: stock.industryDetail || stock.industry || "行业待同步",
    enterpriseNature: stock.enterpriseNature || "性质待同步",
    price: numberOrNull(stock.price),
    changePct: numberOrNull(stock.changePct),
    quoteTime: stockQuoteTime(stored),
    quoteSource: stock.quoteSource || "snapshot",
    historyAsOf: stock.historyAsOf || null,
    threeMonthChangePct: numberOrNull(stock.threeMonthChangePct),
    maxDailyDecline3m: numberOrNull(stock.maxDailyDecline3m),
    priceLow1y: numberOrNull(stock.priceLow1y),
    priceHigh1y: numberOrNull(stock.priceHigh1y),
    priceTrackPosition1y: numberOrNull(stock.priceTrackPosition1y),
    priceTrackBand1y: stock.priceTrackBand1y || null,
    ma250: numberOrNull(stock.ma250),
    bollTracks: Object.fromEntries(
      Object.entries(stock.bollTracks || {}).map(([period, track]) => [
        period,
        {
          band: track?.band || null,
          positionPct: numberOrNull(track?.positionPct),
          lower: numberOrNull(track?.lower),
          middle: numberOrNull(track?.middle),
          upper: numberOrNull(track?.upper),
        },
      ]),
    ),
    dividendPerShare: numberOrNull(stock.dividendPerShare),
    dividendYear: numberOrNull(stock.dividendYear),
    historicalMaxDividendYield10y: numberOrNull(
      stock.historicalMaxDividendYield10y,
    ),
    historicalMaxDividendYear: numberOrNull(stock.historicalMaxDividendYear),
    historicalMaxDividendPrice: numberOrNull(
      stock.historicalMaxDividendPrice,
    ),
    historicalMaxDividendPerShare: numberOrNull(
      stock.historicalMaxDividendPerShare,
    ),
    recentAnnualLowPrices3y: annualLows,
    twoYearLow: twoYearLowSummary(annualLows, numberOrNull(stock.price)),
    recentDividendYields3y: (stock.recentDividendYields3y || [])
      .map((item) => ({
        year: numberOrNull(item.year),
        dividendYear: numberOrNull(item.dividendYear),
        yieldPct: numberOrNull(item.yieldPct),
        priceUsed: numberOrNull(item.priceUsed),
        dividendPerShare: numberOrNull(item.dividendPerShare),
      }))
      .filter((item) => Number.isFinite(item.year)),
  };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatYield(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "--";
  return `¥${value.toFixed(2)}`;
}

function normalizeAnnualLowPrices(stock) {
  const currentYear = Number(shanghaiParts().year);
  const rows = stock.recentAnnualLowPricesBasis === "unadjusted_daily_low_v1" &&
    Array.isArray(stock.recentAnnualLowPrices3y) ? stock.recentAnnualLowPrices3y : [];
  return Array.from({ length: 3 }, (_, index) => {
    const year = currentYear - 2 + index;
    const item = rows.find((row) => row && Number(row.year) === year);
    const price = numberOrNull(item?.price);
    const valid = price > 0 && ["full", "partial"].includes(item?.coverage);
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(item?.asOf) ? item.asOf : null;
    // A cached year-to-date low cannot become a full-year low at midnight on Jan 1.
    const unfinishedPastYear = year < currentYear && (!asOf || asOf <= `${year}-12-31`);
    return {
      year,
      price: valid ? price : null,
      date: valid && /^\d{4}-\d{2}-\d{2}$/.test(item?.date) ? item.date : null,
      asOf,
      coverage: valid ? (unfinishedPastYear ? "partial" : item.coverage) : "missing",
      current: year === currentYear,
    };
  });
}

function annualLowRows(quote) {
  return quote.recentAnnualLowPrices3y.map((item) => {
    const available = Number.isFinite(item.price) && item.price > 0;
    const distance = available && Number.isFinite(quote.price) && quote.price > 0
      ? (quote.price / item.price - 1) * 100 : null;
    const distanceText = formatPercent(distance);
    const period = item.current ? "年内最低" : "年度最低";
    const label = item.coverage === "partial" ? "区间最低" : period;
    const title = available
      ? `${item.year} 年${label}：${formatPrice(item.price)}；不复权日 K 最低价；最低价日期：${item.date || "未知"}；数据截至：${item.asOf || "未知"}${item.coverage === "partial" ? "；数据未确认覆盖完整年度，不代表完整年度最低价" : ""}；现价较该低价：${distanceText}；计算方式：（当前价 ÷ 该低价 − 1）× 100%；当前价：${formatPrice(quote.price)}`
      : `${item.year} 年最低价暂无数据，等待历史行情同步`;
    const note = item.coverage === "partial" ? "区间最低" : item.current ? "年内" : "";
    return `<span class="annual-low-item" title="${escapeHtml(title)}"><span class="annual-low-year">${item.year}${note ? `<small>${note}</small>` : ""}</span><strong>${available ? escapeHtml(formatPrice(item.price)) : "暂无数据"}</strong><small class="annual-low-distance">现价较低价 ${escapeHtml(distanceText)}</small></span>`;
  }).join("");
}

function twoYearLowSummary(annualLows, currentPrice) {
  const currentYear = Number(shanghaiParts().year);
  const years = [currentYear - 1, currentYear];
  const rows = years.map((year) => annualLows.find((item) => item.year === year));
  const complete = rows.every((item) => item?.coverage === "full" &&
    Number.isFinite(item.price) && item.price > 0 && item.asOf);
  const price = complete ? Math.min(...rows.map((item) => item.price)) : null;
  const distancePct = price > 0 && Number.isFinite(currentPrice) && currentPrice > 0
    ? (currentPrice / price - 1) * 100 : null;
  return { price, distancePct, yearsLabel: years.join("–") };
}

function formatBollValue(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(3);
}

function formatBollPrice(value) {
  if (!Number.isFinite(value)) return "--";
  return `¥${formatBollValue(value)}`;
}

function formatBollPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(3)}%`;
}

function ma250DistancePct(quote) {
  if (!Number.isFinite(quote.price) || !Number.isFinite(quote.ma250) || quote.ma250 <= 0) {
    return null;
  }
  return ((quote.price - quote.ma250) / quote.ma250) * 100;
}

function getBollLowerRailSignal(price, lowerRail) {
  if (!Number.isFinite(price) || !Number.isFinite(lowerRail) || lowerRail <= 0) {
    return {
      status: "unknown",
      label: "距下轨 --",
      distancePct: null,
    };
  }

  const distancePct = ((price - lowerRail) / lowerRail) * 100;
  if (distancePct < 0) {
    return {
      status: "below",
      label: `已跌破下轨 ${formatBollPercent(distancePct)}`,
      distancePct,
    };
  }

  if (distancePct <= 2) {
    return {
      status: "near",
      label: `接近下轨 ${formatBollPercent(distancePct)}`,
      distancePct,
    };
  }

  return {
    status: "normal",
    label: `距下轨 ${formatBollPercent(distancePct)}`,
    distancePct,
  };
}

function declineClass(changePct) {
  if (!Number.isFinite(changePct)) return "flat";
  if (changePct <= -5) return "severe";
  if (changePct <= -3) return "moderate";
  return "flat";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stockQuoteUrl(code) {
  const exchange = code.startsWith("6") ? "SH" : "SZ";
  const chartParams = new URLSearchParams({
    period: "day",
    indicator: "boll",
  });
  return `https://xueqiu.com/S/${exchange}${code}?${chartParams}`;
}

function metricFor(quote) {
  if (state.period === "threeMonth") return quote.threeMonthChangePct;
  return quote.changePct;
}

function rowTemplate(quote) {
  const changeValue = metricFor(quote);
  const freshness = quoteStatus(quote.quoteTime);
  const dividendYield =
    Number.isFinite(quote.dividendPerShare) && quote.price > 0
      ? (quote.dividendPerShare / quote.price) * 100
      : null;
  const yearNote = Number.isFinite(quote.dividendYear)
    ? `${quote.dividendYear} 年度`
    : "暂无分红数据";
  const currentYieldTitle =
    Number.isFinite(dividendYield) &&
    Number.isFinite(quote.dividendPerShare) &&
    Number.isFinite(quote.price)
      ? `${yearNote}税前每股分红 ${formatPrice(quote.dividendPerShare)} ÷ 现价 ${formatPrice(quote.price)} = ${formatYield(dividendYield)}`
      : yearNote;
  const track = PRICE_TRACK_META[quote.priceTrackBand1y] || null;
  const trackText =
    track && Number.isFinite(quote.priceTrackPosition1y)
      ? `${track.label} ${Math.round(quote.priceTrackPosition1y)}%`
      : "轨道 --";
  const trackTitle =
    track &&
    Number.isFinite(quote.priceLow1y) &&
    Number.isFinite(quote.priceHigh1y)
      ? `近1年价格轨道：${track.label}，区间 ${quote.priceLow1y.toFixed(2)} - ${quote.priceHigh1y.toFixed(2)}`
      : "暂无近1年价格轨道";
  const bollTrackRows = Object.entries(BOLL_PERIOD_META)
    .map(([period, periodMeta]) => {
      const bollTrack = quote.bollTracks[period];
      const bandMeta = BOLL_BAND_META[bollTrack?.band] || null;
      const label = bandMeta
        ? `${periodMeta.shortLabel}·${bandMeta.label}`
        : `${periodMeta.shortLabel}·--`;
      const title =
        bandMeta &&
        Number.isFinite(bollTrack.positionPct) &&
        Number.isFinite(bollTrack.lower) &&
        Number.isFinite(bollTrack.middle) &&
        Number.isFinite(bollTrack.upper)
          ? `${periodMeta.label} BOLL(20, 2σ)：${bandMeta.label}区，位置 ${bollTrack.positionPct.toFixed(0)}%，下轨 ${formatBollValue(bollTrack.lower)} / 中轨 ${formatBollValue(bollTrack.middle)} / 上轨 ${formatBollValue(bollTrack.upper)}`
          : `${periodMeta.label} BOLL 暂无数据`;
      const datedTitle = `${title}；历史数据同步日：${quote.historyAsOf || "未知"}，轨道由历史行情计算`;
      return `<span class="boll-track ${bandMeta?.className || "unknown"}" title="${escapeHtml(datedTitle)}">${escapeHtml(label)}</span>`;
    })
    .join("");
  const activeBollPeriod = BOLL_PERIOD_META[state.bollPeriod];
  const activeBollTrack = quote.bollTracks[state.bollPeriod];
  const activeLowerRailSignal = getBollLowerRailSignal(
    quote.price,
    activeBollTrack?.lower,
  );
  const activeLowerRailTitle =
    Number.isFinite(activeLowerRailSignal.distancePct) &&
    Number.isFinite(activeBollTrack?.lower) &&
    Number.isFinite(quote.price)
      ? `${activeBollPeriod.label} BOLL 下轨距离：(现价 ${formatPrice(quote.price)} - 下轨 ${formatBollPrice(activeBollTrack.lower)}) ÷ 下轨 ${formatBollPrice(activeBollTrack.lower)} = ${formatBollPercent(activeLowerRailSignal.distancePct)}`
      : `${activeBollPeriod.label} BOLL 下轨距离暂无数据`;
  const dailyBollTrack = quote.bollTracks.day;
  const ma250Distance = ma250DistancePct(quote);
  const ma250PositionClass = Number.isFinite(ma250Distance)
    ? ma250Distance >= 0 ? "above" : "below"
    : "unknown";
  const ma250Title = Number.isFinite(ma250Distance)
    ? `MA250（最近 250 个交易日前复权收盘价均值）：(现价 ${formatPrice(quote.price)} - 年线 ${formatBollPrice(quote.ma250)}) ÷ 年线 ${formatBollPrice(quote.ma250)} = ${formatBollPercent(ma250Distance)}；按带正负号的原始值筛选和排序，不取绝对值`
    : "MA250 暂无数据";
  const historicalYieldText = Number.isFinite(
    quote.historicalMaxDividendYield10y,
  )
    ? `峰值 ${formatYield(quote.historicalMaxDividendYield10y)}`
    : "峰值 --";
  const historicalPriceText = Number.isFinite(
    quote.historicalMaxDividendPrice,
  )
    ? `计算价 ${formatPrice(quote.historicalMaxDividendPrice)}`
    : "计算价 --";
  const historicalYieldTitle =
    Number.isFinite(quote.historicalMaxDividendYield10y) &&
    Number.isFinite(quote.historicalMaxDividendYear) &&
    Number.isFinite(quote.historicalMaxDividendPrice) &&
    Number.isFinite(quote.historicalMaxDividendPerShare)
      ? `近10年峰值：${quote.historicalMaxDividendYear} 年度每股分红 ${formatPrice(quote.historicalMaxDividendPerShare)} ÷ ${quote.historicalMaxDividendYear + 1} 年股息计算价 ${formatPrice(quote.historicalMaxDividendPrice)} = ${formatYield(quote.historicalMaxDividendYield10y)}`
      : "暂无近10年历史股息率";
  const recentYieldRows = quote.recentDividendYields3y
    .map((item) => {
      const yieldText = formatYield(item.yieldPct);
      const priceText = Number.isFinite(item.priceUsed)
        ? `计算价 ${formatPrice(item.priceUsed)}`
        : "计算价 --";
      const itemTitle =
        Number.isFinite(item.yieldPct) &&
        Number.isFinite(item.priceUsed) &&
        Number.isFinite(item.dividendPerShare)
        ? `${item.year} 年股息率：${item.dividendYear} 年度每股分红 ${formatPrice(item.dividendPerShare)} ÷ ${item.year} 年股息计算价 ${formatPrice(item.priceUsed)} = ${formatYield(item.yieldPct)}`
        : `${item.year} 年暂无完整数据`;
      return `<span class="recent-yield-item" title="${escapeHtml(itemTitle)}"><span>${item.year}</span><span class="recent-yield-values"><strong>${escapeHtml(yieldText)}</strong><small>${escapeHtml(priceText)}</small></span></span>`;
    })
    .join("");
  const quoteUrl = stockQuoteUrl(quote.code);
  const isStarred = state.starredCodes.has(quote.code);
  const annualLowAsOf = quote.recentAnnualLowPrices3y.find((item) => item.current)?.asOf;
  const twoYearLow = quote.twoYearLow;
  const twoYearLowTitle = `${twoYearLow.yearsLabel}（今年+去年）的不复权最低价；当前年截至 ${annualLowAsOf || "未知"}；（当前价 ÷ 两年最低价 − 1）× 100%；升序按负值到正值排列，不取绝对值${twoYearLow.price === null ? "；两年历史数据不足" : ""}`;
  return `
    <tr data-code="${escapeHtml(quote.code)}">
      <td>
        <div class="stock-name">
          <a class="stock-name-link" href="${escapeHtml(quoteUrl)}" target="_blank" rel="noopener noreferrer" title="在雪球查看 ${escapeHtml(quote.name)} 日 K / BOLL 行情" aria-label="在雪球查看 ${escapeHtml(quote.name)} 日 K / BOLL 行情">
            <span class="stock-link-label">${escapeHtml(quote.name)}</span>
            <span class="external-link-mark" aria-hidden="true">↗</span>
          </a>
          <button class="stock-star${isStarred ? " is-starred" : ""}" type="button" data-toggle-star="${escapeHtml(quote.code)}" title="${isStarred ? "取消关注" : "关注"} ${escapeHtml(quote.name)}" aria-label="${isStarred ? "取消关注" : "关注"} ${escapeHtml(quote.name)}" aria-pressed="${isStarred}">${STAR_ICON}</button>
        </div>
        <div class="stock-meta">
          <span class="stock-code">${escapeHtml(quote.code)}</span>
          <span class="industry-tag" title="同花顺申万行业：${escapeHtml(quote.industryDetail)}">${escapeHtml(quote.industry)}</span>
          <span class="enterprise-nature-tag" title="企业性质：${escapeHtml(quote.enterpriseNature)}">${escapeHtml(quote.enterpriseNature)}</span>
          <span class="price-track ${track?.className || "unknown"}" title="${escapeHtml(trackTitle)}">${escapeHtml(trackText)}</span>
        </div>
        <div class="boll-track-list" aria-label="BOLL 日周月轨道">${bollTrackRows}</div>
        <div class="boll-lower-distance ${activeLowerRailSignal.status}" title="${escapeHtml(activeLowerRailTitle)}" aria-label="${escapeHtml(activeBollPeriod.label)} BOLL ${escapeHtml(activeLowerRailSignal.label)}">
          <span>${escapeHtml(activeLowerRailSignal.label)}</span>
          <small>${escapeHtml(activeBollPeriod.shortLabel)}线下轨 ${escapeHtml(formatBollPrice(activeBollTrack?.lower))}</small>
        </div>
        <div class="technical-price-levels" aria-label="日线 BOLL 与 MA250 技术价位">
          <span title="日线 BOLL 下轨">日下 <strong>${escapeHtml(formatBollPrice(dailyBollTrack?.lower))}</strong></span>
          <span title="日线 BOLL 中轨">日中 <strong>${escapeHtml(formatBollPrice(dailyBollTrack?.middle))}</strong></span>
          <span title="日线 BOLL 上轨">日上 <strong>${escapeHtml(formatBollPrice(dailyBollTrack?.upper))}</strong></span>
          <span class="ma250-level ${ma250PositionClass}" title="${escapeHtml(ma250Title)}">MA250 <strong>${escapeHtml(formatBollPrice(quote.ma250))}</strong> · 距年线 <strong>${escapeHtml(formatBollPercent(ma250Distance))}</strong></span>
        </div>
      </td>
      <td class="history-yield-cell">
        <div class="metric-note history-yield-note">
          <span class="metric-note-peak" title="${escapeHtml(historicalYieldTitle)}">${escapeHtml(historicalYieldText)}</span>
          <span class="metric-note-peak-price">${escapeHtml(historicalPriceText)}</span>
          <span class="recent-yield-list" aria-label="最近三年历史股息率">${recentYieldRows}</span>
        </div>
      </td>
      <td class="annual-low-cell">
        <div class="two-year-low-summary" title="${escapeHtml(twoYearLowTitle)}">
          <span>距两年低价 <strong>${escapeHtml(formatPercent(twoYearLow.distancePct))}</strong></span>
          <small>${escapeHtml(twoYearLow.yearsLabel)} · ${twoYearLow.price === null ? "数据不足" : escapeHtml(formatPrice(twoYearLow.price))}</small>
        </div>
        <div class="annual-low-list" aria-label="最近三年最低股价">${annualLowRows(quote)}</div>
        <small class="annual-low-note">不复权 · ${annualLowAsOf ? `本年截至 ${escapeHtml(annualLowAsOf)}` : "本年待同步"}</small>
      </td>
      <td class="numeric change-cell">
        <span class="metric ${declineClass(changeValue)}">${formatPercent(changeValue)}</span>
        <small class="quote-time ${freshness.stale ? "is-stale" : ""}" title="北京时间；${quote.quoteSource === "live" ? "腾讯行情报价" : "缓存报价"}">${escapeHtml(freshness.text)}</small>
      </td>
      <td class="numeric current-price-cell">
        <div class="current-price-value">${escapeHtml(formatPrice(quote.price))}</div>
      </td>
      <td class="numeric current-yield-cell">
        <div class="yield-value" title="${escapeHtml(currentYieldTitle)}">${formatPercent(dividendYield)}</div>
      </td>
      <td class="row-action-cell">
        <button class="row-action" type="button" data-remove="${escapeHtml(quote.code)}" title="移除 ${escapeHtml(quote.name)}" aria-label="移除 ${escapeHtml(quote.name)}">${TRASH_ICON}</button>
      </td>
    </tr>`;
}

function sortQuotes(quotes) {
  return [...quotes].sort((a, b) => {
    if (
      state.sortOrder === "bollAscending" ||
      state.sortOrder === "bollDescending" ||
      state.sortOrder === "twoYearLowAscending" ||
      state.sortOrder === "twoYearLowDescending" ||
      state.sortOrder === "ma250Ascending" ||
      state.sortOrder === "ma250Descending" ||
      state.sortOrder === "trackPositionAscending" ||
      state.sortOrder === "trackPositionDescending" ||
      state.sortOrder === "currentPriceAscending" ||
      state.sortOrder === "currentPriceDescending"
    ) {
      const twoYearSort = state.sortOrder.startsWith("twoYearLow");
      const ma250Sort = state.sortOrder.startsWith("ma250");
      const trackPositionSort = state.sortOrder.startsWith("trackPosition");
      const currentPriceSort = state.sortOrder.startsWith("currentPrice");
      const aDistance = currentPriceSort ? a.price
        : trackPositionSort ? a.priceTrackPosition1y
        : twoYearSort ? a.twoYearLow.distancePct
        : ma250Sort ? ma250DistancePct(a)
          : getBollLowerRailSignal(a.price, a.bollTracks[state.bollPeriod]?.lower).distancePct;
      const bDistance = currentPriceSort ? b.price
        : trackPositionSort ? b.priceTrackPosition1y
        : twoYearSort ? b.twoYearLow.distancePct
        : ma250Sort ? ma250DistancePct(b)
          : getBollLowerRailSignal(b.price, b.bollTracks[state.bollPeriod]?.lower).distancePct;
      const aValid = Number.isFinite(aDistance);
      const bValid = Number.isFinite(bDistance);
      if (!aValid || !bValid) {
        if (aValid) return -1;
        if (bValid) return 1;
        return a.code.localeCompare(b.code);
      }
      const direction = state.sortOrder.endsWith("Ascending") ? 1 : -1;
      return (
        (aDistance - bDistance) * direction ||
        a.code.localeCompare(b.code)
      );
    }
    const aMetric = metricFor(a);
    const bMetric = metricFor(b);
    const aValid = Number.isFinite(aMetric);
    const bValid = Number.isFinite(bMetric);
    if (!aValid || !bValid) {
      if (aValid) return -1;
      if (bValid) return 1;
      return a.code.localeCompare(b.code);
    }
    const direction = state.sortOrder === "rise" ? -1 : 1;
    return (aMetric - bMetric) * direction || a.code.localeCompare(b.code);
  });
}

function renderIndustryOptions(quotes) {
  const industryCounts = quotes.reduce((counts, quote) => {
    counts.set(quote.industry, (counts.get(quote.industry) || 0) + 1);
    return counts;
  }, new Map());
  const industries = [...industryCounts.entries()].sort(
    ([industryA, countA], [industryB, countB]) =>
      countB - countA || industryA.localeCompare(industryB, "zh-CN"),
  );
  if (
    state.industry !== "all" &&
    !industryCounts.has(state.industry)
  ) {
    state.industry = "all";
  }
  elements.industryFilter.innerHTML = [
    `<option value="all">全部行业</option>`,
    ...industries.map(
      ([industry, count]) =>
        `<option value="${escapeHtml(industry)}" title="${escapeHtml(industry)}：${count} 只">${escapeHtml(industry)}</option>`,
    ),
  ].join("");
  elements.industryFilter.value = state.industry;
}

function renderEnterpriseNatureOptions(quotes) {
  const natureCounts = quotes.reduce((counts, quote) => {
    counts.set(
      quote.enterpriseNature,
      (counts.get(quote.enterpriseNature) || 0) + 1,
    );
    return counts;
  }, new Map());
  const natures = [...natureCounts.entries()].sort(
    ([natureA, countA], [natureB, countB]) =>
      countB - countA || natureA.localeCompare(natureB, "zh-CN"),
  );
  if (
    state.enterpriseNature !== "all" &&
    !natureCounts.has(state.enterpriseNature)
  ) {
    state.enterpriseNature = "all";
  }
  elements.enterpriseNatureFilter.innerHTML = [
    `<option value="all">全部性质</option>`,
    ...natures.map(
      ([nature, count]) =>
        `<option value="${escapeHtml(nature)}" title="${escapeHtml(nature)}：${count} 只">${escapeHtml(nature)}</option>`,
    ),
  ].join("");
  elements.enterpriseNatureFilter.value = state.enterpriseNature;
}

function matchesFilters(quote) {
  if (state.starredOnly && !state.starredCodes.has(quote.code)) return false;
  const searchQuery = normalizeStockSearch(state.searchQuery);
  if (searchQuery) {
    const searchScore = Math.min(
      fuzzyMatchScore(normalizeStockSearch(quote.name), searchQuery),
      fuzzyMatchScore(quote.code, searchQuery),
      fuzzyMatchScore(normalizeStockSearch(quote.industryDetail), searchQuery),
      fuzzyMatchScore(normalizeStockSearch(quote.enterpriseNature), searchQuery),
    );
    if (!Number.isFinite(searchScore)) return false;
  }
  const metric = metricFor(quote);
  if (!Number.isFinite(metric)) return false;
  if (state.industry !== "all" && quote.industry !== state.industry) {
    return false;
  }
  if (
    state.enterpriseNature !== "all" &&
    quote.enterpriseNature !== state.enterpriseNature
  ) {
    return false;
  }
  if (state.threshold > 0 && metric > -state.threshold) return false;
  if (state.ma250Position !== "all") {
    const distance = ma250DistancePct(quote);
    if (!Number.isFinite(distance)) return false;
    if (state.ma250Position === "above" && distance < 0) return false;
    if (state.ma250Position === "below" && distance >= 0) return false;
  }
  if (state.twoYearLowRange !== "all") {
    const distance = quote.twoYearLow.distancePct;
    if (!Number.isFinite(distance)) return false;
    if (state.twoYearLowRange === "below") {
      if (distance >= 0) return false;
    // Preserve inclusive upper bounds despite floating-point noise (e.g. 5.000000000000004%).
    } else if (distance < 0 || distance > Number(state.twoYearLowRange) + 1e-9) {
      return false;
    }
  }
  if (
    state.bollBand !== "all" &&
    quote.bollTracks[state.bollPeriod]?.band !== state.bollBand
  ) {
    return false;
  }
  if (state.period === "largestDaily") {
    return (
      quoteStatus(quote.quoteTime).day === shanghaiParts().day &&
      quote.historyAsOf === shanghaiParts().day &&
      quote.changePct < 0 &&
      Number.isFinite(quote.maxDailyDecline3m) &&
      quote.changePct < quote.maxDailyDecline3m
    );
  }
  return true;
}

function render() {
  const availableQuotes = state.codes.map(quoteFor).filter(Boolean);
  const allToday = availableQuotes.length > 0 && availableQuotes.every(
    (quote) => quoteStatus(quote.quoteTime).day === shanghaiParts().day,
  );
  renderIndustryOptions(availableQuotes);
  renderEnterpriseNatureOptions(availableQuotes);
  const filteredQuotes = sortQuotes(availableQuotes.filter(matchesFilters));
  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageQuotes = filteredQuotes.slice(start, start + state.pageSize);

  if (!state.codes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="7">暂无自选股</td></tr>`;
  } else if (!availableQuotes.length && state.loading) {
    elements.stockRows.innerHTML = `
      <tr class="loading-row">
        <td colspan="7"><span class="spinner" aria-hidden="true"></span>正在读取行情</td>
      </tr>`;
  } else if (!availableQuotes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="7">行情暂不可用</td></tr>`;
  } else if (!filteredQuotes.length) {
    const waitingForHistory = state.period === "largestDaily" && availableQuotes.some(
      (quote) => quote.historyAsOf !== shanghaiParts().day,
    );
    const emptyMessage = state.searchQuery.trim()
      ? "没有找到匹配的股票"
      : state.starredOnly
        ? "暂无符合当前条件的星标股票"
        : waitingForHistory
          ? "历史指标待同步，暂无法完整判断今日异常"
          : "没有符合筛选条件的股票";
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="7">${emptyMessage}</td></tr>`;
  } else {
    elements.stockRows.innerHTML = pageQuotes.map(rowTemplate).join("");
  }

  const filterMeta = { ...FILTER_META[state.period] };
  if (state.period === "daily" && !allToday) filterMeta.title = "行情表现（含历史或待更新数据）";
  if (state.period === "largestDaily") filterMeta.title = "今日近3月异常（已同步历史数据）";
  elements.watchlistTitle.textContent = filterMeta.title;
  elements.changeHeaderLabel.textContent = filterMeta.header;
  elements.bollBandFilter.value = state.bollBand;
  elements.bollPeriodFilter.value = state.bollPeriod;
  elements.periodFilter.value = state.period;
  elements.sortOrder.value = state.sortOrder;
  elements.thresholdFilter.value = String(state.threshold);
  elements.twoYearLowFilter.value = state.twoYearLowRange;
  elements.ma250Filter.value = state.ma250Position;
  elements.starredOnlyFilter.checked = state.starredOnly;
  const metricSortActive = ["decline", "rise"].includes(state.sortOrder);
  if (metricSortActive) {
    const declineFirst = state.sortOrder === "decline";
    const currentSortLabel = declineFirst
      ? "从低到高，跌幅优先"
      : "从高到低，涨幅优先";
    const nextSortLabel = declineFirst ? "从高到低" : "从低到高";
    elements.changeHeader.setAttribute(
      "aria-sort",
      declineFirst ? "ascending" : "descending",
    );
    elements.changeSortIcon.textContent = declineFirst ? "↑" : "↓";
    elements.changeSortButton.title = `${currentSortLabel}，点击切换为${nextSortLabel}`;
    elements.changeSortButton.setAttribute(
      "aria-label",
      `${filterMeta.header}，当前${currentSortLabel}，点击切换为${nextSortLabel}`,
    );
  } else {
    const periodLabel = BOLL_PERIOD_META[state.bollPeriod].label;
    const twoYearSort = state.sortOrder.startsWith("twoYearLow");
    const ma250Sort = state.sortOrder.startsWith("ma250");
    const trackPositionSort = state.sortOrder.startsWith("trackPosition");
    const currentPriceSort = state.sortOrder.startsWith("currentPrice");
    const distanceLabel = currentPriceSort ? "当前股价"
      : trackPositionSort ? "近一年位置"
      : twoYearSort ? "两年低价距离"
      : ma250Sort ? "MA250 距离"
        : `${periodLabel} BOLL 下轨距离`;
    const ascending = state.sortOrder.endsWith("Ascending");
    const distanceSortLabel = currentPriceSort
      ? `${distanceLabel}${ascending ? "升序（低价在前）" : "降序（高价在前）"}`
      : trackPositionSort
        ? `${distanceLabel}${ascending ? "升序（低位在前）" : "降序（高位在前）"}`
      : `${distanceLabel}${ascending ? "升序（负值在前）" : "降序（正值在前）"}`;
    elements.changeHeader.setAttribute("aria-sort", "none");
    elements.changeSortIcon.textContent = "↕";
    elements.changeSortButton.title = `当前按${distanceSortLabel}排序，点击改为跌幅优先`;
    elements.changeSortButton.setAttribute(
      "aria-label",
      `${filterMeta.header}，当前列表按${distanceSortLabel}排序，点击改为跌幅优先`,
    );
  }
  elements.resultCount.textContent = `${filteredQuotes.length} 只`;
  elements.starredFilterCount.textContent = String(
    state.codes.filter((code) => state.starredCodes.has(code)).length,
  );
  elements.pageStatus.textContent = `第 ${state.page} / ${totalPages} 页`;
  elements.previousPageButton.disabled = state.page <= 1;
  elements.nextPageButton.disabled = state.page >= totalPages;
  elements.stockCount.textContent = String(state.codes.length);
  elements.severeDeclineCount.textContent = String(
    availableQuotes.filter((quote) => quote.changePct <= -5).length,
  );
  elements.alertCount.textContent = String(
    availableQuotes.filter((quote) => quote.changePct <= -3).length,
  );
  renderStockSuggestions();
  renderMarketStatus(availableQuotes);
}

function normalizeStockSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "");
}

function fuzzyMatchScore(candidate, query) {
  if (!candidate || !query) return Number.POSITIVE_INFINITY;
  if (candidate === query) return 0;
  if (candidate.startsWith(query)) return 1;
  if (candidate.includes(query)) return 2;

  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return 3;
  }
  return Number.POSITIVE_INFINITY;
}

function findMatchingStocks(query) {
  const normalizedQuery = normalizeStockSearch(query);
  if (!normalizedQuery) return [];

  return Object.entries(state.market?.stocks || {})
    .map(([code, stock]) => {
      const name = stock.name || code;
      const score = Math.min(
        fuzzyMatchScore(normalizeStockSearch(name), normalizedQuery),
        fuzzyMatchScore(code, normalizedQuery),
      );
      return { code, name, score };
    })
    .filter((stock) => Number.isFinite(stock.score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.name.localeCompare(b.name, "zh-CN") ||
        a.code.localeCompare(b.code),
    );
}

function hideStockSuggestions() {
  elements.stockSuggestionPanel.hidden = true;
  elements.stockQuery.setAttribute("aria-expanded", "false");
}

function renderStockSuggestions(query = elements.stockQuery.value) {
  const normalizedQuery = normalizeStockSearch(query);
  if (!elements.addDialog.open || !normalizedQuery) {
    hideStockSuggestions();
    elements.stockSuggestionPanel.replaceChildren();
    return;
  }

  const matches = findMatchingStocks(query);
  const fragment = document.createDocumentFragment();
  const summary = document.createElement("div");
  summary.className = "stock-suggestion-summary";
  summary.textContent = matches.length
    ? `找到 ${matches.length} 只匹配股票${matches.length > 6 ? "，显示前 6 只" : ""}`
    : "没有找到匹配股票";
  fragment.append(summary);

  matches.slice(0, 6).forEach((stock) => {
    const isAdded = state.codes.includes(stock.code);
    const button = document.createElement("button");
    button.className = "stock-suggestion-option";
    button.type = "button";
    button.dataset.stockSuggestion = stock.code;
    button.dataset.stockName = stock.name;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.disabled = isAdded;

    const identity = document.createElement("span");
    identity.className = "stock-suggestion-identity";
    const name = document.createElement("strong");
    name.textContent = stock.name;
    const code = document.createElement("span");
    code.textContent = stock.code;
    identity.append(name, code);
    button.append(identity);

    if (isAdded) {
      const status = document.createElement("span");
      status.className = "stock-suggestion-status";
      status.textContent = "已添加";
      button.append(status);
    }
    fragment.append(button);
  });
  elements.stockSuggestionPanel.replaceChildren(fragment);
  elements.stockSuggestionPanel.hidden = false;
  elements.stockQuery.setAttribute("aria-expanded", "true");
}

function shanghaiParts(value = new Date()) {
  const parts = Object.fromEntries(SHANGHAI_TIME.formatToParts(value).map((part) => [part.type, part.value]));
  return { ...parts, day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function isQuoteSession(now = new Date()) {
  const parts = shanghaiParts(now);
  // Use the Shanghai calendar day (UTC midnight), not the user's local weekday.
  const shanghaiWeekday = new Date(`${parts.day}T00:00:00Z`).getUTCDay();
  return shanghaiWeekday >= 1 && shanghaiWeekday <= 5 &&
    ((parts.minutes >= 555 && parts.minutes <= 690) ||
     (parts.minutes >= 780 && parts.minutes <= 900));
}

function quoteStatus(value, now = new Date()) {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 60000) {
    return { text: "行情时间未知", day: null, stale: true, timestamp: null };
  }
  const quote = shanghaiParts(new Date(timestamp));
  const today = shanghaiParts(now);
  const yesterday = shanghaiParts(new Date(now.getTime() - 86400000)).day;
  const clock = `${quote.month}/${quote.day.slice(-2)} ${quote.hour}:${quote.minute}`;
  if (quote.day === today.day) {
    const auction = quote.minutes >= 555 && quote.minutes < 565;
    const auctionComplete = today.minutes >= 565 && today.minutes < 570 && quote.minutes >= 565;
    const stale = isQuoteSession(now) && !auctionComplete && now.getTime() - timestamp > 120000;
    const label = auction ? (stale ? "集合竞价参考（延迟）" : "集合竞价参考") : stale ? "今日行情（延迟）" : "今日行情";
    return { text: `${label} · ${clock}:${quote.second}`, day: quote.day, stale, timestamp };
  }
  const label = quote.day === yesterday ? "昨日行情" : "历史行情";
  const dateLabel = quote.year === today.year ? clock : `${quote.year}/${clock}`;
  return { text: `${label} · ${dateLabel}`, day: quote.day, stale: true, timestamp };
}

function renderMarketStatus(quotes) {
  const statuses = quotes.map((quote) => quoteStatus(quote.quoteTime));
  const valid = statuses.filter((status) => status.timestamp !== null);
  const days = new Set(statuses.map((status) => status.day));
  if (!valid.length) {
    elements.updatedAt.textContent = "行情时间未知";
  } else if (days.size > 1) {
    elements.updatedAt.textContent = "混合日期 · 详见各股行情时间";
  } else {
    elements.updatedAt.textContent = valid.reduce((oldest, item) => item.timestamp < oldest.timestamp ? item : oldest).text;
  }
  const staleCount = statuses.filter((status) => status.stale).length;
  elements.updatedAt.classList.toggle("is-stale", staleCount > 0);
  if (!quotes.length) {
    elements.marketStatus.textContent = state.loading ? "正在获取行情" : "行情暂不可用，稍后自动重试";
    return;
  }
  const cadence = document.hidden ? "后台已暂停刷新" : isQuoteSession() ? "每15秒自动刷新" : "每60秒自动刷新";
  const parts = [state.liveError ? "实时行情获取失败，保留最近报价" : cadence];
  if (state.missingQuotes) parts.push(`${state.missingQuotes}只报价未更新`);
  if (staleCount) parts.push(`${staleCount}只为历史、延迟或时间未知行情`);
  const historyPending = quotes.filter((quote) => quoteStatus(quote.quoteTime).day === shanghaiParts().day && quote.historyAsOf !== shanghaiParts().day).length;
  if (historyPending) parts.push(`${historyPending}只历史指标待同步，暂不参与今日异常筛选`);
  elements.marketStatus.textContent = parts.join(" · ");
}

function scheduleQuoteRefresh() {
  window.clearTimeout(quoteRefreshTimer);
  if (document.hidden) return;
  quoteRefreshTimer = window.setTimeout(() => refresh({ automatic: true }), isQuoteSession() ? 15000 : 60000);
}

async function refresh({ automatic = false } = {}) {
  if (state.loading) return;
  window.clearTimeout(quoteRefreshTimer);
  state.loading = true;
  elements.refreshButton.disabled = true;
  if (!automatic) elements.refreshButton.classList.add("is-spinning");
  void refreshSnapshot(!automatic);

  try {
    const result = await LiveMarket.fetchQuotes(DEFAULT_CODES);
    const stocks = { ...state.market?.stocks };
    let olderQuotes = 0;
    for (const [code, quote] of Object.entries(result.quotes)) {
      const oldTime = stocks[code] ? Date.parse(stockQuoteTime(stocks[code])) : NaN;
      if (Number.isFinite(oldTime) && oldTime <= Date.now() + 60000 && oldTime > Date.parse(quote.quoteTime)) {
        olderQuotes += 1;
        continue;
      }
      stocks[code] = { ...stocks[code], ...quote };
    }
    state.market = { ...state.market, stocks };
    state.liveError = "";
    state.missingQuotes = result.failedCount + olderQuotes;
    saveJson(STORAGE_KEYS.market, state.market);
  } catch (error) {
    state.liveError = error.message || "行情更新失败";
    if (!automatic) showToast(state.liveError);
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.classList.remove("is-spinning");
    render();
    scheduleQuoteRefresh();
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function openAddDialog() {
  elements.addForm.reset();
  elements.formError.textContent = "";
  hideStockSuggestions();
  elements.addDialog.showModal();
  window.setTimeout(() => elements.stockQuery.focus(), 30);
}

function closeAddDialog() {
  hideStockSuggestions();
  elements.addDialog.close();
}

function resolveStockQuery(query) {
  const normalizedQuery = normalizeStockSearch(query);
  const matches = findMatchingStocks(query);
  const exactMatch = matches.find(
    (stock) =>
      stock.code === normalizedQuery ||
      normalizeStockSearch(stock.name) === normalizedQuery,
  );
  if (exactMatch) return { code: exactMatch.code };

  if (matches.length === 1) return { code: matches[0].code };
  if (matches.length > 1) {
    const names = matches
      .slice(0, 3)
      .map((stock) => stock.name)
      .join("、");
    return { error: `找到 ${matches.length} 只：${names}，请从提示中选择` };
  }
  return { error: "没有找到该股票，请检查名称或代码" };
}

function addStock(event) {
  event.preventDefault();
  const query = elements.stockQuery.value.trim();
  elements.formError.textContent = "";

  const resolved = resolveStockQuery(query);
  if (resolved.error) {
    elements.formError.textContent = resolved.error;
    return;
  }
  const code = resolved.code;
  if (state.codes.includes(code)) {
    elements.formError.textContent = "这只股票已在自选中";
    return;
  }
  const quote = quoteFor(code);
  if (!quote || !Number.isFinite(quote.price)) {
    elements.formError.textContent = "不在当前同步股票清单中";
    return;
  }

  state.codes.push(code);
  state.page = 1;
  saveJson(STORAGE_KEYS.watchlist, state.codes);
  closeAddDialog();
  render();
  showToast(`已添加 ${quote.name}`);
}

function removeStock(code) {
  const quote = quoteFor(code);
  state.codes = state.codes.filter((item) => item !== code);
  if (state.starredCodes.delete(code)) saveStarredCodes();
  saveJson(STORAGE_KEYS.watchlist, state.codes);
  render();
  showToast(`已移除 ${quote?.name || code}`);
  if (!state.codes.length) {
    elements.marketStatus.textContent = "等待添加自选股";
  }
}

function toggleStar(code) {
  const quote = quoteFor(code);
  if (!state.codes.includes(code)) return;
  const wasStarred = state.starredCodes.has(code);
  if (wasStarred) state.starredCodes.delete(code);
  else state.starredCodes.add(code);
  saveStarredCodes();
  state.page = 1;
  render();
  showToast(`${wasStarred ? "已取消关注" : "已关注"} ${quote?.name || code}`);
}

function resetFilters() {
  state.period = "daily";
  state.threshold = 0;
  state.twoYearLowRange = "all";
  state.ma250Position = "all";
  state.industry = "all";
  state.enterpriseNature = "all";
  state.bollPeriod = "day";
  state.bollBand = "all";
  state.starredOnly = false;
  state.searchQuery = "";
  state.sortOrder = "decline";
  state.page = 1;
  elements.stockListSearch.value = "";
  render();
  showToast("筛选条件已重置");
}

function showDeclineShortcut(threshold) {
  state.period = "daily";
  state.threshold = threshold;
  state.twoYearLowRange = "all";
  state.ma250Position = "all";
  state.industry = "all";
  state.enterpriseNature = "all";
  state.bollBand = "all";
  state.starredOnly = false;
  state.searchQuery = "";
  state.sortOrder = "decline";
  state.page = 1;
  elements.stockListSearch.value = "";
  render();
  elements.watchlistSection.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

elements.addButton.addEventListener("click", openAddDialog);
elements.closeDialogButton.addEventListener("click", closeAddDialog);
elements.addForm.addEventListener("submit", addStock);
elements.refreshButton.addEventListener("click", refresh);
elements.resetFiltersButton.addEventListener("click", resetFilters);
elements.severeDeclineShortcut.addEventListener("click", () => {
  showDeclineShortcut(5);
});
elements.alertShortcut.addEventListener("click", () => {
  showDeclineShortcut(3);
});
elements.periodFilter.addEventListener("change", (event) => {
  if (!FILTER_META[event.target.value]) return;
  state.period = event.target.value;
  state.page = 1;
  render();
});
elements.thresholdFilter.addEventListener("change", (event) => {
  state.threshold = Number(event.target.value) || 0;
  state.page = 1;
  render();
});
elements.twoYearLowFilter.addEventListener("change", (event) => {
  state.twoYearLowRange = ["all", "below", "5", "10", "20"].includes(event.target.value)
    ? event.target.value : "all";
  state.page = 1;
  render();
});
elements.ma250Filter.addEventListener("change", (event) => {
  state.ma250Position = ["all", "above", "below"].includes(event.target.value)
    ? event.target.value : "all";
  state.page = 1;
  render();
});
elements.industryFilter.addEventListener("change", (event) => {
  state.industry = event.target.value || "all";
  state.page = 1;
  render();
});
elements.enterpriseNatureFilter.addEventListener("change", (event) => {
  state.enterpriseNature = event.target.value || "all";
  state.page = 1;
  render();
});
elements.stockListSearch.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  state.page = 1;
  render();
});
elements.starredOnlyFilter.addEventListener("change", (event) => {
  state.starredOnly = event.target.checked;
  state.page = 1;
  render();
});
elements.bollPeriodFilter.addEventListener("change", (event) => {
  state.bollPeriod = BOLL_PERIOD_META[event.target.value]
    ? event.target.value
    : "day";
  state.page = 1;
  render();
});
elements.bollBandFilter.addEventListener("change", (event) => {
  state.bollBand = BOLL_BAND_META[event.target.value]
    ? event.target.value
    : "all";
  state.page = 1;
  render();
});
elements.sortOrder.addEventListener("change", (event) => {
  state.sortOrder = [
    "decline",
    "rise",
    "bollAscending",
    "bollDescending",
    "twoYearLowAscending",
    "twoYearLowDescending",
    "ma250Ascending",
    "ma250Descending",
    "trackPositionAscending",
    "trackPositionDescending",
    "currentPriceAscending",
    "currentPriceDescending",
  ].includes(event.target.value)
    ? event.target.value
    : "decline";
  state.page = 1;
  render();
});
elements.changeSortButton.addEventListener("click", () => {
  state.sortOrder = state.sortOrder === "decline" ? "rise" : "decline";
  state.page = 1;
  render();
});
elements.pageSizeSelect.addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value) || 50;
  state.page = 1;
  render();
});
elements.previousPageButton.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  render();
});
elements.nextPageButton.addEventListener("click", () => {
  state.page += 1;
  render();
});
elements.stockRows.addEventListener("click", (event) => {
  const starButton = event.target.closest("[data-toggle-star]");
  if (starButton) {
    toggleStar(starButton.dataset.toggleStar);
    return;
  }
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) removeStock(removeButton.dataset.remove);
});
elements.addDialog.addEventListener("click", (event) => {
  if (event.target === elements.addDialog) closeAddDialog();
});
elements.stockSuggestionPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stock-suggestion]");
  if (!button || button.disabled) return;
  elements.stockQuery.value = button.dataset.stockName;
  elements.formError.textContent = "";
  hideStockSuggestions();
  elements.stockQuery.focus();
});
elements.stockQuery.addEventListener("input", () => {
  elements.formError.textContent = "";
  renderStockSuggestions();
});
elements.stockQuery.addEventListener("focus", () => renderStockSuggestions());

function initializeApp() {
  if (appInitialized) return;
  appInitialized = true;
  if (!Array.isArray(state.codes)) state.codes = [...DEFAULT_CODES];
  state.codes = [...new Set(state.codes.filter((code) => /^\d{6}$/.test(code)))];
  render();
  refresh();
}

window.addEventListener("stock-authenticated", initializeApp);
window.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.authenticated === "true") initializeApp();
});

document.addEventListener("visibilitychange", () => {
  if (!appInitialized) return;
  window.clearTimeout(quoteRefreshTimer);
  if (document.hidden) renderMarketStatus(state.codes.map(quoteFor).filter(Boolean));
  else refresh({ automatic: true });
});

window.addEventListener("pagehide", () => window.clearTimeout(quoteRefreshTimer));
window.addEventListener("pageshow", (event) => {
  if (appInitialized && event.persisted && !document.hidden) refresh({ automatic: true });
});
