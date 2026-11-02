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
  "000568",
  "000848",
  "002216",
  "002271",
  "002293",
  "002327",
  "002415",
  "002555",
  "002557",
  "002572",
  "002582",
  "002818",
  "002832",
  "002867",
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
  "600295",
  "600329",
  "600377",
  "600398",
  "600566",
  "600582",
  "600585",
  "600600",
  "601098",
  "601225",
  "601336",
  "601668",
  "601919",
  "601928",
  "603195",
  "603565",
  "603833",
  "603866",
  "605337",
  "605338",
];

const DEFAULT_CODES = [
  ...new Set([...BASE_CODES, ...BANK_CODES, ...EXTRA_CODES]),
];

const STORAGE_KEYS = {
  watchlist: "a-share-dip-watch:watchlist:v7",
  legacyWatchlists: [
    "a-share-dip-watch:watchlist:v6",
    "a-share-dip-watch:watchlist:v5",
    "a-share-dip-watch:watchlist:v4",
    "a-share-dip-watch:watchlist:v3",
    "a-share-dip-watch:watchlist:v2",
  ],
  market: "a-share-dip-watch:market:v12",
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

let toastTimer;

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
  formError: document.querySelector("#formError"),
  industryFilter: document.querySelector("#industryFilter"),
  marketStatus: document.querySelector("#marketStatus"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
  pageStatus: document.querySelector("#pageStatus"),
  periodFilter: document.querySelector("#periodFilter"),
  previousPageButton: document.querySelector("#previousPageButton"),
  refreshButton: document.querySelector("#refreshButton"),
  resultCount: document.querySelector("#resultCount"),
  sortOrder: document.querySelector("#sortOrder"),
  stockCount: document.querySelector("#stockCount"),
  stockListSearch: document.querySelector("#stockListSearch"),
  stockQuery: document.querySelector("#stockQuery"),
  stockRows: document.querySelector("#stockRows"),
  stockSuggestionPanel: document.querySelector("#stockSuggestionPanel"),
  thresholdFilter: document.querySelector("#thresholdFilter"),
  toast: document.querySelector("#toast"),
  updatedAt: document.querySelector("#updatedAt"),
  watchlistSection: document.querySelector("#watchlistSection"),
  watchlistTitle: document.querySelector("#watchlistTitle"),
};

const state = {
  codes: loadWatchlist(),
  market: loadJson(STORAGE_KEYS.market, null),
  loading: false,
  bollBand: "all",
  bollPeriod: "day",
  industry: "all",
  period: "daily",
  threshold: 0,
  page: 1,
  pageSize: 50,
  searchQuery: "",
  sortOrder: "decline",
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
  localStorage.setItem(key, JSON.stringify(value));
}

function loadWatchlist() {
  const current = loadJson(STORAGE_KEYS.watchlist, null);
  if (Array.isArray(current)) return current;

  const legacy =
    STORAGE_KEYS.legacyWatchlists
      .map((key) => loadJson(key, null))
      .find((value) => Array.isArray(value)) || BASE_CODES;
  const migrated = [
    ...new Set([
      ...(Array.isArray(legacy) ? legacy : BASE_CODES),
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
  const response = await fetch(`./data/market.json?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`行情文件读取失败 (${response.status})`);
  const data = await response.json();
  if (!data?.stocks || Object.keys(data.stocks).length !== DEFAULT_CODES.length) {
    throw new Error("行情文件不完整");
  }
  return data;
}

function quoteFor(code) {
  const stock = state.market?.stocks?.[code];
  if (!stock) return null;
  return {
    code,
    name: stock.name || code,
    industry: stock.industry || "行业待同步",
    industryDetail: stock.industryDetail || stock.industry || "行业待同步",
    price: numberOrNull(stock.price),
    changePct: numberOrNull(stock.changePct),
    threeMonthChangePct: numberOrNull(stock.threeMonthChangePct),
    maxDailyDecline3m: numberOrNull(stock.maxDailyDecline3m),
    priceLow1y: numberOrNull(stock.priceLow1y),
    priceHigh1y: numberOrNull(stock.priceHigh1y),
    priceTrackPosition1y: numberOrNull(stock.priceTrackPosition1y),
    priceTrackBand1y: stock.priceTrackBand1y || null,
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
      label: `已跌破下轨 ${distancePct.toFixed(2)}%`,
      distancePct,
    };
  }

  if (distancePct <= 2) {
    return {
      status: "near",
      label: `接近下轨 +${distancePct.toFixed(2)}%`,
      distancePct,
    };
  }

  return {
    status: "normal",
    label: `距下轨 +${distancePct.toFixed(2)}%`,
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
          ? `${periodMeta.label} BOLL(20, 2σ)：${bandMeta.label}区，位置 ${bollTrack.positionPct.toFixed(0)}%，下轨 ${bollTrack.lower.toFixed(2)} / 中轨 ${bollTrack.middle.toFixed(2)} / 上轨 ${bollTrack.upper.toFixed(2)}`
          : `${periodMeta.label} BOLL 暂无数据`;
      return `<span class="boll-track ${bandMeta?.className || "unknown"}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
    })
    .join("");
  const dailyBollTrack = quote.bollTracks.day;
  const dailyLowerRailSignal = getBollLowerRailSignal(
    quote.price,
    dailyBollTrack?.lower,
  );
  const dailyLowerRailTitle =
    Number.isFinite(dailyLowerRailSignal.distancePct) &&
    Number.isFinite(dailyBollTrack?.lower) &&
    Number.isFinite(quote.price)
      ? `日线 BOLL 下轨距离：(现价 ${formatPrice(quote.price)} - 下轨 ${formatPrice(dailyBollTrack.lower)}) ÷ 下轨 ${formatPrice(dailyBollTrack.lower)} = ${dailyLowerRailSignal.distancePct.toFixed(2)}%`
      : "日线 BOLL 下轨距离暂无数据";
  const historicalYieldText = Number.isFinite(
    quote.historicalMaxDividendYield10y,
  )
    ? `峰值 ${formatYield(quote.historicalMaxDividendYield10y)}`
    : "峰值 --";
  const historicalPriceText = Number.isFinite(
    quote.historicalMaxDividendPrice,
  )
    ? `低价 ${formatPrice(quote.historicalMaxDividendPrice)}`
    : "低价 --";
  const historicalYieldTitle =
    Number.isFinite(quote.historicalMaxDividendYield10y) &&
    Number.isFinite(quote.historicalMaxDividendYear) &&
    Number.isFinite(quote.historicalMaxDividendPrice) &&
    Number.isFinite(quote.historicalMaxDividendPerShare)
      ? `近10年峰值：${quote.historicalMaxDividendYear} 年度每股分红 ${formatPrice(quote.historicalMaxDividendPerShare)} ÷ ${quote.historicalMaxDividendYear + 1} 年最低周价 ${formatPrice(quote.historicalMaxDividendPrice)} = ${formatYield(quote.historicalMaxDividendYield10y)}`
      : "暂无近10年历史股息率";
  const recentYieldRows = quote.recentDividendYields3y
    .map((item) => {
      const yieldText = formatYield(item.yieldPct);
      const priceText = Number.isFinite(item.priceUsed)
        ? `低价 ${formatPrice(item.priceUsed)}`
        : "低价 --";
      const itemTitle =
        Number.isFinite(item.yieldPct) &&
        Number.isFinite(item.priceUsed) &&
        Number.isFinite(item.dividendPerShare)
        ? `${item.year} 年股息率：${item.dividendYear} 年度每股分红 ${formatPrice(item.dividendPerShare)} ÷ ${item.year} 年最低周价 ${formatPrice(item.priceUsed)} = ${formatYield(item.yieldPct)}`
        : `${item.year} 年暂无完整数据`;
      return `<span class="recent-yield-item" title="${escapeHtml(itemTitle)}"><span>${item.year}</span><span class="recent-yield-values"><strong>${escapeHtml(yieldText)}</strong><small>${escapeHtml(priceText)}</small></span></span>`;
    })
    .join("");
  const quoteUrl = stockQuoteUrl(quote.code);
  return `
    <tr data-code="${escapeHtml(quote.code)}">
      <td>
        <div class="stock-name">
          <a class="stock-name-link" href="${escapeHtml(quoteUrl)}" target="_blank" rel="noopener noreferrer" title="在雪球查看 ${escapeHtml(quote.name)} 日 K / BOLL 行情" aria-label="在雪球查看 ${escapeHtml(quote.name)} 日 K / BOLL 行情">
            <span class="stock-link-label">${escapeHtml(quote.name)}</span>
            <span class="external-link-mark" aria-hidden="true">↗</span>
          </a>
        </div>
        <div class="stock-meta">
          <span class="stock-code">${escapeHtml(quote.code)}</span>
          <span class="industry-tag" title="同花顺申万行业：${escapeHtml(quote.industryDetail)}">${escapeHtml(quote.industry)}</span>
          <span class="price-track ${track?.className || "unknown"}" title="${escapeHtml(trackTitle)}">${escapeHtml(trackText)}</span>
        </div>
        <div class="boll-track-list" aria-label="BOLL 日周月轨道">${bollTrackRows}</div>
        <div class="boll-lower-distance ${dailyLowerRailSignal.status}" title="${escapeHtml(dailyLowerRailTitle)}" aria-label="日线 BOLL ${escapeHtml(dailyLowerRailSignal.label)}">
          <span>${escapeHtml(dailyLowerRailSignal.label)}</span>
          <small>下轨 ${escapeHtml(formatPrice(dailyBollTrack?.lower))}</small>
        </div>
      </td>
      <td class="numeric">
        <span class="metric ${declineClass(changeValue)}">${formatPercent(changeValue)}</span>
      </td>
      <td class="numeric">
        <div class="yield-value" title="${escapeHtml(currentYieldTitle)}">${formatPercent(dividendYield)}</div>
        <div class="current-yield-price">现价 ${escapeHtml(formatPrice(quote.price))}</div>
        <div class="metric-note">
          <span class="metric-note-peak" title="${escapeHtml(historicalYieldTitle)}">${escapeHtml(historicalYieldText)}</span>
          <span class="metric-note-peak-price">${escapeHtml(historicalPriceText)}</span>
          <span class="recent-yield-list" aria-label="最近三年历史股息率">${recentYieldRows}</span>
        </div>
      </td>
      <td class="row-action-cell">
        <button class="row-action" type="button" data-remove="${escapeHtml(quote.code)}" title="移除 ${escapeHtml(quote.name)}" aria-label="移除 ${escapeHtml(quote.name)}">${TRASH_ICON}</button>
      </td>
    </tr>`;
}

function sortQuotes(quotes) {
  return [...quotes].sort((a, b) => {
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

function matchesFilters(quote) {
  const searchQuery = normalizeStockSearch(state.searchQuery);
  if (searchQuery) {
    const searchScore = Math.min(
      fuzzyMatchScore(normalizeStockSearch(quote.name), searchQuery),
      fuzzyMatchScore(quote.code, searchQuery),
    );
    if (!Number.isFinite(searchScore)) return false;
  }
  const metric = metricFor(quote);
  if (!Number.isFinite(metric)) return false;
  if (state.industry !== "all" && quote.industry !== state.industry) {
    return false;
  }
  if (state.threshold > 0 && metric > -state.threshold) return false;
  if (
    state.bollBand !== "all" &&
    quote.bollTracks[state.bollPeriod]?.band !== state.bollBand
  ) {
    return false;
  }
  if (state.period === "largestDaily") {
    return (
      quote.changePct < 0 &&
      Number.isFinite(quote.maxDailyDecline3m) &&
      quote.changePct < quote.maxDailyDecline3m
    );
  }
  return true;
}

function render() {
  const availableQuotes = state.codes.map(quoteFor).filter(Boolean);
  renderIndustryOptions(availableQuotes);
  const filteredQuotes = sortQuotes(availableQuotes.filter(matchesFilters));
  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageQuotes = filteredQuotes.slice(start, start + state.pageSize);

  if (!state.codes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="4">暂无自选股</td></tr>`;
  } else if (!availableQuotes.length && state.loading) {
    elements.stockRows.innerHTML = `
      <tr class="loading-row">
        <td colspan="4"><span class="spinner" aria-hidden="true"></span>正在读取行情</td>
      </tr>`;
  } else if (!availableQuotes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="4">行情暂不可用</td></tr>`;
  } else if (!filteredQuotes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="4">${state.searchQuery.trim() ? "没有找到匹配的股票" : "没有符合筛选条件的股票"}</td></tr>`;
  } else {
    elements.stockRows.innerHTML = pageQuotes.map(rowTemplate).join("");
  }

  const filterMeta = FILTER_META[state.period];
  elements.watchlistTitle.textContent = filterMeta.title;
  elements.changeHeaderLabel.textContent = filterMeta.header;
  elements.bollBandFilter.value = state.bollBand;
  elements.bollPeriodFilter.value = state.bollPeriod;
  elements.periodFilter.value = state.period;
  elements.sortOrder.value = state.sortOrder;
  elements.thresholdFilter.value = String(state.threshold);
  const declineFirst = state.sortOrder === "decline";
  const currentSortLabel = declineFirst ? "从低到高，跌幅优先" : "从高到低，涨幅优先";
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
  elements.resultCount.textContent = `${filteredQuotes.length} 只`;
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

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  elements.refreshButton.disabled = true;
  elements.refreshButton.classList.add("is-spinning");
  elements.marketStatus.textContent = "正在刷新行情";
  render();

  try {
    state.market = await fetchMarket();
    saveJson(STORAGE_KEYS.market, state.market);
    elements.updatedAt.textContent = formatTime(
      state.market.quoteTime || state.market.generatedAt,
    );
    elements.marketStatus.textContent = "行情已更新 · 可按当日或近3月筛选";
  } catch (error) {
    if (state.market?.stocks) {
      elements.updatedAt.textContent = formatTime(
        state.market.quoteTime || state.market.generatedAt,
      );
      elements.marketStatus.textContent = "更新失败，显示上次数据";
    } else {
      elements.updatedAt.textContent = "--";
      elements.marketStatus.textContent = "行情暂不可用";
    }
    showToast(error.message || "行情更新失败");
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.classList.remove("is-spinning");
    render();
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
  saveJson(STORAGE_KEYS.watchlist, state.codes);
  render();
  showToast(`已移除 ${quote?.name || code}`);
  if (!state.codes.length) {
    elements.marketStatus.textContent = "等待添加自选股";
  }
}

function showDeclineShortcut(threshold) {
  state.period = "daily";
  state.threshold = threshold;
  state.industry = "all";
  state.bollBand = "all";
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
elements.industryFilter.addEventListener("change", (event) => {
  state.industry = event.target.value || "all";
  state.page = 1;
  render();
});
elements.stockListSearch.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
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
  state.sortOrder = event.target.value === "rise" ? "rise" : "decline";
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
  const button = event.target.closest("[data-remove]");
  if (button) removeStock(button.dataset.remove);
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

window.addEventListener("DOMContentLoaded", () => {
  if (!Array.isArray(state.codes)) state.codes = [...DEFAULT_CODES];
  state.codes = [...new Set(state.codes.filter((code) => /^\d{6}$/.test(code)))];
  render();
  refresh();
});
