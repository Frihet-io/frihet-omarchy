const PLUGIN_ID = "io.frihet.erp";
const MAX_PAYLOAD_BYTES = 65536;

function clean(value, maxLen) {
  if (value === null || value === undefined) return "";
  const limit = typeof maxLen === "number" && maxLen > 0 ? maxLen : 120;
  const str = String(value)
    .replace(/[<>&]/g, "")
    .replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (str.length > limit) {
    return str.slice(0, limit).trim();
  }
  return str;
}

function isFiniteNumber(v) {
  return typeof v === "number" && isFinite(v);
}

function nonNegativeInt(v) {
  if (!isFiniteNumber(v) || v < 0) return 0;
  return Math.floor(v);
}

function emptyState() {
  return {
    configured: false,
    ok: false,
    loading: true,
    workspaceName: "",
    period: "",
    currency: "EUR",
    mixedCurrency: false,
    revenueTotal: null,
    expensesTotal: null,
    netProfit: null,
    vatPayable: null,
    paidCount: 0,
    sentCount: 0,
    overdueCount: 0,
    draftCount: 0,
    recentInvoices: [],
    totalInvoicesCount: 0,
    partialSample: false,
    error: "",
    updatedAt: ""
  };
}

function mergeState(overrides) {
  const base = emptyState();
  if (!overrides) return base;
  const keys = Object.keys(overrides);
  for (let i = 0; i < keys.length; i++) {
    base[keys[i]] = overrides[keys[i]];
  }
  return base;
}

function formatMoney(amount, currency, mixedCurrency) {
  if (mixedCurrency === true) return "MIXED";
  if (!isFiniteNumber(amount)) return "N/A";
  const curr = clean(currency || "EUR", 8).toUpperCase() || "EUR";
  return amount.toFixed(2) + " " + curr;
}

function formatCompactMoney(amount, currency, mixedCurrency) {
  if (mixedCurrency === true) return "MIXED";
  if (!isFiniteNumber(amount)) return "N/A";
  const curr = clean(currency || "EUR", 8).toUpperCase() || "EUR";
  if (Math.abs(amount) >= 1000) {
    return (amount / 1000).toFixed(1).replace(/\.0$/, "") + "k " + curr;
  }
  return Math.round(amount) + " " + curr;
}

function parsePayload(raw) {
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > MAX_PAYLOAD_BYTES) {
    const invalidMsg = "Invalid or oversized payload";
    return {
      ok: false,
      configured: true,
      error: invalidMsg,
      state: mergeState({
        loading: false,
        configured: true,
        error: invalidMsg
      })
    };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_err) {
    const parseMsg = "Malformed JSON response";
    return {
      ok: false,
      configured: true,
      error: parseMsg,
      state: mergeState({
        loading: false,
        configured: true,
        error: parseMsg
      })
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const shapeMsg = "Malformed JSON response";
    return {
      ok: false,
      configured: true,
      error: shapeMsg,
      state: mergeState({
        loading: false,
        configured: true,
        error: shapeMsg
      })
    };
  }

  if (data.errorCode === "missing_api_key") {
    const setupMsg = clean(
      data.error || "Configure ~/.config/frihet/env (mode 0600) with FRIHET_API_KEY",
      140
    );
    return {
      ok: false,
      configured: false,
      error: setupMsg,
      state: mergeState({
        loading: false,
        configured: false,
        error: setupMsg
      })
    };
  }

  if (data.ok !== true) {
    const apiErrMsg = clean(data.error || "Frihet API error", 140);
    return {
      ok: false,
      configured: true,
      error: apiErrMsg,
      state: mergeState({
        loading: false,
        configured: true,
        error: apiErrMsg
      })
    };
  }

  const currency = clean(data.currency || "EUR", 8).toUpperCase() || "EUR";
  const seenCurrencies = Object.create(null);
  if (data.currency) {
    seenCurrencies[currency] = true;
  }

  const rawInvoices = Array.isArray(data.recentInvoices) ? data.recentInvoices : [];
  const recentInvoices = [];
  const maxInvoices = Math.min(rawInvoices.length, 5);

  for (let i = 0; i < maxInvoices; i++) {
    const inv = rawInvoices[i];
    if (!inv || typeof inv !== "object") continue;

    const invCurrRaw = inv.currency ? clean(inv.currency, 8).toUpperCase() : "";
    if (invCurrRaw) {
      seenCurrencies[invCurrRaw] = true;
    }
    const invCurrency = invCurrRaw || currency;

    const invAmount = isFiniteNumber(inv.amount)
      ? inv.amount
      : (isFiniteNumber(inv.total) ? inv.total : null);

    recentInvoices.push({
      id: clean(inv.id || "", 64),
      number: clean(inv.number || inv.documentNumber || inv.id || "-", 32) || "-",
      clientName: clean(inv.clientName || inv.counterpartyName || "Client", 64) || "Client",
      status: clean(inv.status || "unknown", 24) || "unknown",
      amountText: formatMoney(invAmount, invCurrency, false),
      currency: invCurrency
    });
  }

  const currencyCount = Object.keys(seenCurrencies).length;
  const mixedCurrency = data.mixedCurrency === true || currencyCount > 1;
  const counts = data.counts && typeof data.counts === "object" ? data.counts : {};
  const totalInvoicesCount = isFiniteNumber(data.totalInvoicesCount) && data.totalInvoicesCount >= 0
    ? Math.floor(data.totalInvoicesCount)
    : recentInvoices.length;
  const partialSample = totalInvoicesCount > recentInvoices.length;

  const state = {
    configured: true,
    ok: true,
    loading: false,
    workspaceName: clean(data.workspaceName || "Frihet ERP", 64) || "Frihet ERP",
    period: clean(data.period || "", 16),
    currency: currency,
    mixedCurrency: mixedCurrency,
    revenueTotal: isFiniteNumber(data.revenueTotal) ? data.revenueTotal : null,
    expensesTotal: isFiniteNumber(data.expensesTotal) ? data.expensesTotal : null,
    netProfit: isFiniteNumber(data.netProfit) ? data.netProfit : null,
    vatPayable: isFiniteNumber(data.vatPayable) ? data.vatPayable : null,
    paidCount: nonNegativeInt(counts.paid),
    sentCount: nonNegativeInt(counts.sent),
    overdueCount: nonNegativeInt(counts.overdue),
    draftCount: nonNegativeInt(counts.draft),
    recentInvoices: recentInvoices,
    totalInvoicesCount: totalInvoicesCount,
    partialSample: partialSample,
    error: "",
    updatedAt: clean(data.updatedAt || "", 40)
  };

  return {
    ok: true,
    configured: true,
    error: "",
    state: state
  };
}

function barLabel(state, showAmountInBar, _refreshing, lastError) {
  if (!state || state.loading) return "Frihet ...";
  if (!state.configured) return "Frihet [key]";
  if (lastError && !state.ok) return "Frihet !";

  let base = "Frihet";
  if (showAmountInBar !== false && isFiniteNumber(state.revenueTotal)) {
    base = "Frihet " + formatCompactMoney(state.revenueTotal, state.currency, state.mixedCurrency);
  } else if (showAmountInBar !== false && state.mixedCurrency === true) {
    base = "Frihet MIXED";
  }

  if (isFiniteNumber(state.overdueCount) && state.overdueCount > 0) {
    base += " [" + Math.floor(state.overdueCount) + "!]";
  }

  const result = clean(base, 48);
  return result || "Frihet";
}

function tooltipLabel(state, lastError) {
  if (!state || state.loading) {
    return "Frihet ERP - Loading...";
  }
  if (!state.configured) {
    return "Frihet ERP - Configure ~/.config/frihet/env (mode 0600)";
  }
  if (lastError && !state.ok) {
    return clean("Frihet ERP - Error: " + lastError, 160);
  }

  const parts = [
    clean(state.workspaceName || "Frihet ERP", 48),
    state.period ? "Period: " + clean(state.period, 16) : "",
    "Revenue: " + formatMoney(state.revenueTotal, state.currency, state.mixedCurrency),
    "Overdue: " + nonNegativeInt(state.overdueCount)
  ];
  if (lastError) {
    parts.push("Stale warning: " + clean(lastError, 64));
  }
  const nonEmpty = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) nonEmpty.push(parts[i]);
  }
  return clean(nonEmpty.join(" | "), 240);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
    clean: clean,
    emptyState: emptyState,
    formatMoney: formatMoney,
    formatCompactMoney: formatCompactMoney,
    parsePayload: parsePayload,
    barLabel: barLabel,
    tooltipLabel: tooltipLabel
  };
}
