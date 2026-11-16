var PLUGIN_ID = "io.frihet.erp";
var MAX_PAYLOAD_BYTES = 262144;

function clean(value, maxLen) {
  if (value === null || value === undefined) return "";
  var limit = typeof maxLen === "number" && maxLen > 0 ? maxLen : 120;
  var str = String(value)
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
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
  var base = emptyState();
  if (!overrides) return base;
  var keys = Object.keys(overrides);
  for (var i = 0; i < keys.length; i++) {
    base[keys[i]] = overrides[keys[i]];
  }
  return base;
}

function formatMoney(amount, currency, mixedCurrency) {
  if (mixedCurrency === true) return "MIXED";
  if (!isFiniteNumber(amount)) return "N/A";
  var curr = clean(currency || "EUR", 8).toUpperCase() || "EUR";
  return amount.toFixed(2) + " " + curr;
}

function formatCompactMoney(amount, currency, mixedCurrency) {
  if (mixedCurrency === true) return "MIXED";
  if (!isFiniteNumber(amount)) return "N/A";
  var curr = clean(currency || "EUR", 8).toUpperCase() || "EUR";
  if (Math.abs(amount) >= 1000) {
    return (amount / 1000).toFixed(1).replace(/\.0$/, "") + "k " + curr;
  }
  return Math.round(amount) + " " + curr;
}

function parsePayload(raw) {
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > MAX_PAYLOAD_BYTES) {
    var invalidMsg = "Invalid or oversized payload";
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

  var data;
  try {
    data = JSON.parse(raw);
  } catch (_err) {
    var parseMsg = "Malformed JSON response";
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
    var shapeMsg = "Malformed JSON response";
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
    var setupMsg = clean(data.error || "Run frihet-omarchy-setup to configure API key", 140);
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
    var apiErrMsg = clean(data.error || "Frihet API error", 140);
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

  var currency = clean(data.currency || "EUR", 8).toUpperCase() || "EUR";
  var seenCurrencies = {};
  if (data.currency) {
    seenCurrencies[currency] = true;
  }

  var rawInvoices = Array.isArray(data.recentInvoices) ? data.recentInvoices : [];
  var recentInvoices = [];
  var maxInvoices = Math.min(rawInvoices.length, 5);

  for (var i = 0; i < maxInvoices; i++) {
    var inv = rawInvoices[i];
    if (!inv || typeof inv !== "object") continue;

    var invCurrRaw = inv.currency ? clean(inv.currency, 8).toUpperCase() : "";
    if (invCurrRaw) {
      seenCurrencies[invCurrRaw] = true;
    }
    var invCurrency = invCurrRaw || currency;

    var invAmount = isFiniteNumber(inv.amount)
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

  var currencyCount = Object.keys(seenCurrencies).length;
  var mixedCurrency = data.mixedCurrency === true || currencyCount > 1;
  var counts = data.counts && typeof data.counts === "object" ? data.counts : {};
  var totalInvoicesCount = isFiniteNumber(data.totalInvoicesCount) && data.totalInvoicesCount >= 0
    ? Math.floor(data.totalInvoicesCount)
    : recentInvoices.length;
  var partialSample = totalInvoicesCount > recentInvoices.length;

  var state = {
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

function barLabel(state, showAmountInBar, refreshing, lastError) {
  if (!state || state.loading) return "Frihet ...";
  if (!state.configured) return "Frihet [setup]";
  if (lastError && !state.ok) return "Frihet !";

  var base = "Frihet";
  if (showAmountInBar !== false && isFiniteNumber(state.revenueTotal)) {
    base = "Frihet " + formatCompactMoney(state.revenueTotal, state.currency, state.mixedCurrency);
  } else if (showAmountInBar !== false && state.mixedCurrency === true) {
    base = "Frihet MIXED";
  }

  if (isFiniteNumber(state.overdueCount) && state.overdueCount > 0) {
    base += " [" + Math.floor(state.overdueCount) + "!]";
  }

  var result = clean(base, 48);
  return result || "Frihet";
}

function tooltipLabel(state, lastError) {
  if (!state || state.loading) {
    return "Frihet ERP - Loading...";
  }
  if (!state.configured) {
    return "Frihet ERP - Setup required (run frihet-omarchy-setup)";
  }
  if (lastError && !state.ok) {
    return clean("Frihet ERP - Error: " + lastError, 160);
  }

  var parts = [
    clean(state.workspaceName || "Frihet ERP", 48),
    state.period ? "Period: " + clean(state.period, 16) : "",
    "Revenue: " + formatMoney(state.revenueTotal, state.currency, state.mixedCurrency),
    "Overdue: " + nonNegativeInt(state.overdueCount)
  ];
  if (lastError) {
    parts.push("Stale warning: " + clean(lastError, 64));
  }
  var nonEmpty = [];
  for (var i = 0; i < parts.length; i++) {
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
