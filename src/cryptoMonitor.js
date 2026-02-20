const crypto = require("crypto");
const fetch = global.fetch || require("node-fetch");

const OKX_BASE_URL = String(process.env.OKX_BASE_URL || "https://www.okx.com").replace(/\/+$/, "");
const DEFAULT_INTERVAL_MS = Math.max(15000, Number(process.env.CRYPTO_MONITOR_INTERVAL_MS || 60000));

function normalizeInstId(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, "-")
    .replace(/\s+/g, "");

  if (!raw) {
    throw new Error("instId is required, e.g. BTC-USDT.");
  }

  const normalized = raw.includes("-") ? raw : `${raw}-USDT`;
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(normalized)) {
    throw new Error("Invalid instId format. Use OKX format like BTC-USDT.");
  }

  return normalized;
}

function normalizeOptional(input) {
  const text = String(input || "").trim();
  return text || "";
}

function buildMonitorId(instId, telegramBotToken, telegramChatId) {
  const token = normalizeOptional(telegramBotToken);
  const chatId = normalizeOptional(telegramChatId) || "default";
  const tokenHash = token ? crypto.createHash("sha1").update(token).digest("hex").slice(0, 10) : "default";
  return `${instId}|${chatId}|${tokenHash}`;
}

function maskChatId(chatId) {
  const value = normalizeOptional(chatId);
  if (!value) return "";
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(1, value.length - 4))}${value.slice(-4)}`;
}

async function fetchOkxCandles30m(instId, limit = 120) {
  const url = `${OKX_BASE_URL}/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=30m&limit=${limit}`;

  const response = await fetch(url, { method: "GET" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`OKX request failed, HTTP ${response.status}`);
  }

  if (String(data?.code) !== "0") {
    throw new Error(data?.msg || "OKX returned non-zero code.");
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  const candles = rows
    .map((row) => ({
      ts: Number(row?.[0]),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.ts) &&
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close),
    )
    .sort((a, b) => a.ts - b.ts);

  if (candles.length === 0) {
    throw new Error(`No valid candle data from OKX for ${instId}.`);
  }

  return candles;
}

function computeEmaSeries(values, period) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const alpha = 2 / (period + 1);
  const series = [];
  let ema = Number(values[0]);

  series.push(ema);
  for (let i = 1; i < values.length; i += 1) {
    ema = Number(values[i]) * alpha + ema * (1 - alpha);
    series.push(ema);
  }

  return series;
}

function calculateMacdSeries(closes) {
  if (!Array.isArray(closes) || closes.length < 35) {
    throw new Error("At least 35 close prices are required for MACD calculation.");
  }

  const ema12 = computeEmaSeries(closes, 12);
  const ema26 = computeEmaSeries(closes, 26);
  const macdLine = closes.map((_, idx) => ema12[idx] - ema26[idx]);
  const signalLine = computeEmaSeries(macdLine, 9);

  return closes.map((_, idx) => {
    const macd = macdLine[idx];
    const signal = signalLine[idx];
    return {
      macd,
      signal,
      histogram: macd - signal,
    };
  });
}

function detectSignal(previous, current) {
  const prevDiff = previous.macd - previous.signal;
  const currDiff = current.macd - current.signal;

  if (prevDiff <= 0 && currDiff > 0) {
    return "golden_cross";
  }

  if (prevDiff >= 0 && currDiff < 0) {
    return "death_cross";
  }

  return null;
}

class CryptoMonitorService {
  constructor({ onSignal, onTick, logger = console, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.onSignal = onSignal;
    this.onTick = onTick;
    this.logger = logger;
    this.intervalMs = Math.max(15000, Number(intervalMs || DEFAULT_INTERVAL_MS));
    this.monitors = new Map();
  }

  list() {
    return Array.from(this.monitors.values()).map((item) => this._snapshot(item.monitorId));
  }

  start(rawInstId, options = {}) {
    const instId = normalizeInstId(rawInstId);
    const telegramBotToken = normalizeOptional(options.telegramBotToken);
    const telegramChatId = normalizeOptional(options.telegramChatId);
    const monitorId = buildMonitorId(instId, telegramBotToken, telegramChatId);
    let state = this.monitors.get(monitorId);

    if (!state) {
      state = {
        monitorId,
        instId,
        timer: null,
        startedAt: new Date().toISOString(),
        lastCheckedAt: null,
        lastSignalAt: null,
        lastSignalType: null,
        lastTriggerKey: null,
        telegramBotToken,
        telegramChatId,
      };
      this.monitors.set(monitorId, state);
    }

    if (state.timer) {
      return this._snapshot(monitorId);
    }

    const run = async () => {
      try {
        await this.check(monitorId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[crypto-monitor] ${state.instId} check failed: ${message}`);
      }
    };

    run();
    state.timer = setInterval(run, this.intervalMs);
    this.logger.log(`[crypto-monitor] started ${state.instId} (${monitorId}), interval=${this.intervalMs}ms`);

    return this._snapshot(monitorId);
  }

  stop(identifier) {
    const key = String(identifier || "").trim();
    if (!key) return 0;

    const exact = this.monitors.get(key);
    if (exact) {
      if (exact.timer) clearInterval(exact.timer);
      this.monitors.delete(key);
      this.logger.log(`[crypto-monitor] stopped ${exact.instId} (${key})`);
      return 1;
    }

    let instId = "";
    try {
      instId = normalizeInstId(key);
    } catch (_err) {
      return 0;
    }

    const matched = Array.from(this.monitors.keys()).filter((monitorId) => this.monitors.get(monitorId)?.instId === instId);
    matched.forEach((monitorId) => {
      const state = this.monitors.get(monitorId);
      if (state?.timer) clearInterval(state.timer);
      this.monitors.delete(monitorId);
    });

    if (matched.length > 0) {
      this.logger.log(`[crypto-monitor] stopped ${instId}, count=${matched.length}`);
    }
    return matched.length;
  }

  async check(monitorId) {
    const state = this.monitors.get(String(monitorId || "").trim());
    if (!state) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const candles = await fetchOkxCandles30m(state.instId, 120);
    state.lastCheckedAt = new Date().toISOString();

    if (candles.length < 35) {
      const result = {
        monitorId: state.monitorId,
        instId: state.instId,
        triggered: false,
        reason: "insufficient_candles",
        checkedAt: state.lastCheckedAt,
        telegramBotToken: state.telegramBotToken,
        telegramChatId: state.telegramChatId,
      };
      if (typeof this.onTick === "function") {
        await this.onTick(result);
      }
      return result;
    }

    const closes = candles.map((c) => c.close);
    const macdSeries = calculateMacdSeries(closes);

    const previous = macdSeries[macdSeries.length - 2];
    const current = macdSeries[macdSeries.length - 1];
    const signalType = detectSignal(previous, current);
    const latest = candles[candles.length - 1];

    const tickPayload = {
      monitorId: state.monitorId,
      instId: state.instId,
      checkedAt: state.lastCheckedAt,
      candleTime: new Date(latest.ts).toISOString(),
      close: latest.close,
      macd: current.macd,
      signalLine: current.signal,
      histogram: current.histogram,
      signalType,
      triggered: false,
      reason: signalType ? "signal_detected" : "no_cross",
      telegramBotToken: state.telegramBotToken,
      telegramChatId: state.telegramChatId,
    };

    if (!signalType) {
      if (typeof this.onTick === "function") {
        await this.onTick(tickPayload);
      }
      return tickPayload;
    }

    const triggerKey = `${latest.ts}:${signalType}`;

    if (state.lastTriggerKey === triggerKey) {
      tickPayload.reason = "duplicate_cross";
      if (typeof this.onTick === "function") {
        await this.onTick(tickPayload);
      }
      return tickPayload;
    }

    state.lastTriggerKey = triggerKey;
    state.lastSignalAt = new Date().toISOString();
    state.lastSignalType = signalType;

    if (typeof this.onSignal === "function") {
      await this.onSignal({
        instId: state.instId,
        signalType,
        candleTime: tickPayload.candleTime,
        close: tickPayload.close,
        macd: tickPayload.macd,
        signalLine: tickPayload.signalLine,
        histogram: tickPayload.histogram,
      });
    }

    tickPayload.triggered = true;
    tickPayload.reason = "cross_triggered";
    if (typeof this.onTick === "function") {
      await this.onTick(tickPayload);
    }

    return tickPayload;
  }

  _snapshot(monitorId) {
    const state = this.monitors.get(String(monitorId || "").trim());
    if (!state) {
      return null;
    }

    return {
      monitorId: state.monitorId,
      instId: state.instId,
      startedAt: state.startedAt,
      lastCheckedAt: state.lastCheckedAt,
      lastSignalAt: state.lastSignalAt,
      lastSignalType: state.lastSignalType,
      hasCustomTelegram: Boolean(state.telegramBotToken && state.telegramChatId),
      telegramChatIdMasked: maskChatId(state.telegramChatId),
    };
  }
}

module.exports = {
  CryptoMonitorService,
  normalizeInstId,
  fetchOkxCandles30m,
  calculateMacdSeries,
  detectSignal,
};
