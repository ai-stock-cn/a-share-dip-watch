"use strict";

const DEFAULT_CODES = [
  "601838",
  "600919",
  "601009",
  "002142",
  "600036",
  "601288",
  "601328",
  "601166",
  "601988",
  "601998",
  "601939",
  "601398",
  "000001",
];

const STORAGE_KEYS = {
  watchlist: "a-share-dip-watch:watchlist:v1",
  market: "a-share-dip-watch:market:v1",
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
  closeDialogButton: document.querySelector("#closeDialogButton"),
  confirmAddButton: document.querySelector("#confirmAddButton"),
  declineCount: document.querySelector("#declineCount"),
  formError: document.querySelector("#formError"),
  marketStatus: document.querySelector("#marketStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  stockCode: document.querySelector("#stockCode"),
  stockCount: document.querySelector("#stockCount"),
  stockRows: document.querySelector("#stockRows"),
  toast: document.querySelector("#toast"),
  updatedAt: document.querySelector("#updatedAt"),
};

const state = {
  codes: loadJson(STORAGE_KEYS.watchlist, DEFAULT_CODES),
  market: loadJson(STORAGE_KEYS.market, null),
  loading: false,
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

async function fetchMarket() {
  const response = await fetch(`./data/market.json?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`行情文件读取失败 (${response.status})`);
  const data = await response.json();
  if (!data?.stocks || Object.keys(data.stocks).length < 1000) {
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
    price: Number(stock.price),
    changePct: Number(stock.changePct),
    dividendPerShare: Number(stock.dividendPerShare),
    dividendYear: Number(stock.dividendYear),
  };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function declineClass(changePct) {
  if (!Number.isFinite(changePct)) return "flat";
  if (changePct <= -5) return "severe";
  if (changePct <= -3) return "moderate";
  if (changePct > 0) return "rise";
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

function rowTemplate(quote) {
  const dividendYield =
    Number.isFinite(quote.dividendPerShare) && quote.price > 0
      ? (quote.dividendPerShare / quote.price) * 100
      : null;
  const yearNote = Number.isFinite(quote.dividendYear)
    ? `${quote.dividendYear} 年度`
    : "暂无分红数据";
  return `
    <tr data-code="${escapeHtml(quote.code)}">
      <td>
        <div class="stock-name" title="${escapeHtml(quote.name)}">${escapeHtml(quote.name)}</div>
        <div class="stock-code">${escapeHtml(quote.code)}</div>
      </td>
      <td class="numeric">
        <span class="metric ${declineClass(quote.changePct)}">${formatPercent(quote.changePct)}</span>
      </td>
      <td class="numeric">
        <div class="yield-value">${formatPercent(dividendYield)}</div>
        <div class="metric-note">${yearNote}</div>
      </td>
      <td class="row-action-cell">
        <button class="row-action" type="button" data-remove="${escapeHtml(quote.code)}" title="移除 ${escapeHtml(quote.name)}" aria-label="移除 ${escapeHtml(quote.name)}">${TRASH_ICON}</button>
      </td>
    </tr>`;
}

function sortQuotes(quotes) {
  return [...quotes].sort((a, b) => {
    const aValue = Number.isFinite(a.changePct) ? a.changePct : Infinity;
    const bValue = Number.isFinite(b.changePct) ? b.changePct : Infinity;
    return aValue - bValue || a.code.localeCompare(b.code);
  });
}

function visibleQuotes() {
  return sortQuotes(state.codes.map(quoteFor).filter(Boolean));
}

function render() {
  const quotes = visibleQuotes();
  if (!state.codes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="4">暂无自选股</td></tr>`;
  } else if (!quotes.length && state.loading) {
    elements.stockRows.innerHTML = `
      <tr class="loading-row">
        <td colspan="4"><span class="spinner" aria-hidden="true"></span>正在读取行情</td>
      </tr>`;
  } else if (!quotes.length) {
    elements.stockRows.innerHTML = `
      <tr class="empty-row"><td colspan="4">行情暂不可用</td></tr>`;
  } else {
    elements.stockRows.innerHTML = quotes.map(rowTemplate).join("");
  }

  elements.stockCount.textContent = String(state.codes.length);
  elements.declineCount.textContent = String(
    quotes.filter((quote) => quote.changePct < 0).length,
  );
  elements.alertCount.textContent = String(
    quotes.filter((quote) => quote.changePct <= -3).length,
  );
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
    elements.marketStatus.textContent = "行情已更新 · 按跌幅排序";
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
  elements.addDialog.showModal();
  window.setTimeout(() => elements.stockCode.focus(), 30);
}

function closeAddDialog() {
  elements.addDialog.close();
}

function addStock(event) {
  event.preventDefault();
  const code = elements.stockCode.value.trim();
  elements.formError.textContent = "";

  if (!/^\d{6}$/.test(code)) {
    elements.formError.textContent = "请输入 6 位股票代码";
    return;
  }
  if (state.codes.includes(code)) {
    elements.formError.textContent = "这只股票已在自选中";
    return;
  }
  const quote = quoteFor(code);
  if (!quote || !Number.isFinite(quote.price)) {
    elements.formError.textContent = "未找到这只沪深 A 股";
    return;
  }

  state.codes.push(code);
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

elements.addButton.addEventListener("click", openAddDialog);
elements.closeDialogButton.addEventListener("click", closeAddDialog);
elements.addForm.addEventListener("submit", addStock);
elements.refreshButton.addEventListener("click", refresh);
elements.stockRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (button) removeStock(button.dataset.remove);
});
elements.addDialog.addEventListener("click", (event) => {
  if (event.target === elements.addDialog) closeAddDialog();
});
elements.stockCode.addEventListener("input", () => {
  elements.stockCode.value = elements.stockCode.value.replace(/\D/g, "").slice(0, 6);
  elements.formError.textContent = "";
});

window.addEventListener("DOMContentLoaded", () => {
  if (!Array.isArray(state.codes)) state.codes = [...DEFAULT_CODES];
  state.codes = [...new Set(state.codes.filter((code) => /^\d{6}$/.test(code)))];
  render();
  refresh();
});
