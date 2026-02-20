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
  constructor({ onSignal, logger = console, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.onSignal = onSignal;
    this.logger = logger;
    this.intervalMs = Math.max(15000, Number(intervalMs || DEFAULT_INTERVAL_MS));
    this.monitors = new Map();
  }

  list() {
    return Array.from(this.monitors.values()).map((item) => ({
      instId: item.instId,
      startedAt: item.startedAt,
      lastCheckedAt: item.lastCheckedAt,
      lastSignalAt: item.lastSignalAt,
      lastSignalType: item.lastSignalType,
    }));
  }

  start(rawInstId) {
    const instId = normalizeInstId(rawInstId);
    let state = this.monitors.get(instId);

    if (!state) {
      state = {
        instId,
        timer: null,
        startedAt: new Date().toISOString(),
        lastCheckedAt: null,
        lastSignalAt: null,
        lastSignalType: null,
        lastTriggerKey: null,
      };
      this.monitors.set(instId, state);
    }

    if (state.timer) {
      return this._snapshot(instId);
    }

    const run = async () => {
      try {
        await this.check(instId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[crypto-monitor] ${instId} check failed: ${message}`);
      }
    };

    run();
    state.timer = setInterval(run, this.intervalMs);
    this.logger.log(`[crypto-monitor] started ${instId}, interval=${this.intervalMs}ms`);

    return this._snapshot(instId);
  }

  stop(rawInstId) {
    const instId = normalizeInstId(rawInstId);
    const state = this.monitors.get(instId);

    if (!state) {
      return false;
    }

    if (state.timer) {
      clearInterval(state.timer);
    }

    this.monitors.delete(instId);
    this.logger.log(`[crypto-monitor] stopped ${instId}`);
    return true;
  }

  async check(rawInstId) {
    const instId = normalizeInstId(rawInstId);
    const state = this.monitors.get(instId);

    if (!state) {
      throw new Error(`Monitor not found for ${instId}.`);
    }

    const candles = await fetchOkxCandles30m(instId, 120);
    state.lastCheckedAt = new Date().toISOString();

    if (candles.length < 35) {
      return {
        instId,
        triggered: false,
        reason: "insufficient_candles",
      };
    }

    const closes = candles.map((c) => c.close);
    const macdSeries = calculateMacdSeries(closes);

    const previous = macdSeries[macdSeries.length - 2];
    const current = macdSeries[macdSeries.length - 1];
    const signalType = detectSignal(previous, current);

    if (!signalType) {
      return {
        instId,
        triggered: false,
        reason: "no_cross",
      };
    }

    const latest = candles[candles.length - 1];
    const triggerKey = `${latest.ts}:${signalType}`;

    if (state.lastTriggerKey === triggerKey) {
      return {
        instId,
        triggered: false,
        reason: "duplicate_cross",
      };
    }

    state.lastTriggerKey = triggerKey;
    state.lastSignalAt = new Date().toISOString();
    state.lastSignalType = signalType;

    const payload = {
      instId,
      signalType,
      candleTime: new Date(latest.ts).toISOString(),
      close: latest.close,
      macd: current.macd,
      signalLine: current.signal,
      histogram: current.histogram,
    };

    if (typeof this.onSignal === "function") {
      await this.onSignal(payload);
    }

    return {
      triggered: true,
      ...payload,
    };
  }

  _snapshot(instId) {
    const state = this.monitors.get(instId);
    if (!state) {
      return null;
    }

    return {
      instId: state.instId,
      startedAt: state.startedAt,
      lastCheckedAt: state.lastCheckedAt,
      lastSignalAt: state.lastSignalAt,
      lastSignalType: state.lastSignalType,
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
