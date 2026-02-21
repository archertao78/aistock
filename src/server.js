const path = require("path");
const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");

const { buildPrompt, buildCryptoSignalPrompt } = require("./prompt");
const { callGemini } = require("./gemini");
const { CryptoMonitorService } = require("./cryptoMonitor");
const { sendTelegramMessage } = require("./telegram");
const {
  saveReport,
  getReportById,
  listReports,
  findLatestReportBySymbolOrName,
  updateReportById,
  deleteReportById,
} = require("./db");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "google/gemini-2.0-flash-001";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://openrouter.ai/api/v1";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change_me";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "change_me_to_a_long_random_secret";
const ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 24);
const ADMIN_COOKIE_NAME = "aistock_admin_token";
const ADMIN_COOKIE_SECURE = String(process.env.ADMIN_COOKIE_SECURE || "false") === "true";

function formatNumber(value, fraction = 6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "N/A";
  }
  return numeric.toFixed(fraction);
}

function formatBeijingTime(input) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    return String(input || "N/A");
  }

  const beijingMs = date.getTime() + 8 * 60 * 60 * 1000;
  const bj = new Date(beijingMs);
  const pad2 = (n) => String(n).padStart(2, "0");

  return [
    bj.getUTCFullYear(),
    "-",
    pad2(bj.getUTCMonth() + 1),
    "-",
    pad2(bj.getUTCDate()),
    " ",
    pad2(bj.getUTCHours()),
    ":",
    pad2(bj.getUTCMinutes()),
    ":",
    pad2(bj.getUTCSeconds()),
    " (UTC+8)",
  ].join("");
}

function formatSignalLabel(signalType) {
  if (signalType === "golden_cross") return "golden_cross";
  if (signalType === "death_cross") return "death_cross";
  return "none";
}

function buildTickTelegramMessage(tickData) {
  const candleStatus = tickData.candleStatus || "unknown";
  const isCross = tickData.signalType === "golden_cross" || tickData.signalType === "death_cross";
  const signalHeadline = isCross ? "Cross signal detected" : "No cross";

  return [
    `OKX monitor update: ${tickData.instId} (${signalHeadline})`,
    `Monitor ID: ${tickData.monitorId || "N/A"}`,
    `Candle status: ${candleStatus}`,
    `Checked at (Beijing): ${formatBeijingTime(tickData.checkedAt || new Date().toISOString())}`,
    `30m candle time (Beijing): ${formatBeijingTime(tickData.candleTime || "N/A")}`,
    `Open: ${formatNumber(tickData.open, 4)}`,
    `High: ${formatNumber(tickData.high, 4)}`,
    `Low: ${formatNumber(tickData.low, 4)}`,
    `Close: ${formatNumber(tickData.close, 4)}`,
    `MACD: ${formatNumber(tickData.macd)}`,
    `Signal: ${formatNumber(tickData.signalLine)}`,
    `Histogram: ${formatNumber(tickData.histogram)}`,
    `Signal type: ${formatSignalLabel(tickData.signalType)}`,
    `Status: ${tickData.reason || "N/A"}`,
  ].join("\n");
}
const cryptoMonitor = new CryptoMonitorService({
  async onTick(tickData) {
    const botToken = String(tickData?.telegramBotToken || TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = String(tickData?.telegramChatId || TELEGRAM_CHAT_ID || "").trim();

    if (!botToken || !chatId) {
      return;
    }

    try {
      const text = buildTickTelegramMessage(tickData);
      await sendTelegramMessage({
        botToken,
        chatId,
        text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[telegram] send failed (${tickData.instId || "unknown"}): ${message}`);
    }
  },
  async onSignal(signalData) {
    const snapshot = {
      instId: signalData.instId,
      signalType: signalData.signalType,
      candleTime: signalData.candleTime,
      close: signalData.close,
      macd: Number(signalData.macd.toFixed(6)),
      signalLine: Number(signalData.signalLine.toFixed(6)),
      histogram: Number(signalData.histogram.toFixed(6)),
    };

    console.log("[crypto-monitor] signal triggered:", JSON.stringify(snapshot));

    if (!GEMINI_API_KEY) {
      console.warn("[crypto-monitor] GEMINI_API_KEY is missing. Skipped AI analysis.");
      return;
    }

    try {
      const prompt = buildCryptoSignalPrompt(snapshot);
      const analysis = await callGemini({
        apiKey: GEMINI_API_KEY,
        model: GEMINI_MODEL,
        baseUrl: GEMINI_BASE_URL,
        prompt,
      });

      console.log(`[crypto-monitor][ai] ${snapshot.instId} ${snapshot.signalType}`);
      console.log(analysis);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[crypto-monitor][ai] ${snapshot.instId} failed: ${message}`);
    }
  },
});

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  if (!header) return {};
  return header.split(";").reduce((acc, item) => {
    const idx = item.indexOf("=");
    if (idx <= 0) return acc;
    const key = item.slice(0, idx).trim();
    const value = decodeURIComponent(item.slice(idx + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const base = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base.length % 4)) % 4);
  return Buffer.from(base + pad, "base64").toString("utf8");
}

function safeCompare(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function signTokenPart(payloadPart) {
  return toBase64Url(crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(payloadPart).digest());
}

function createAdminToken(username) {
  const expiresAt = Date.now() + Math.max(1, ADMIN_SESSION_HOURS) * 60 * 60 * 1000;
  const payload = {
    u: username,
    exp: expiresAt,
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = signTokenPart(payloadPart);
  return `${payloadPart}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payloadPart, signature] = token.split(".");
  const expected = signTokenPart(payloadPart);
  if (!safeCompare(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart));
    if (!payload?.u || !payload?.exp) return null;
    if (Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch (_err) {
    return null;
  }
}

function getAdminUser(req) {
  const cookies = parseCookies(req);
  const payload = verifyAdminToken(cookies[ADMIN_COOKIE_NAME]);
  return payload?.u || null;
}

function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: ADMIN_COOKIE_SECURE,
    sameSite: "lax",
    maxAge: Math.max(1, ADMIN_SESSION_HOURS) * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
}

function requireAdminApi(req, res, next) {
  const user = getAdminUser(req);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.adminUser = user;
  return next();
}

function requireAdminPage(req, res, next) {
  const user = getAdminUser(req);
  if (!user) {
    return res.redirect("/admin/login");
  }
  req.adminUser = user;
  return next();
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
  });
});

app.get("/api/crypto/monitor", (_req, res) => {
  res.json({
    items: cryptoMonitor.list(),
  });
});

app.post("/api/crypto/monitor", (req, res) => {
  const instId = String(req.body?.instId || "").trim();
  const telegramBotToken = String(req.body?.telegramBotToken || "").trim();
  const telegramChatId = String(req.body?.telegramChatId || "").trim();

  if (!instId) {
    return res.status(400).json({ message: "Please provide instId, e.g. BTC-USDT." });
  }
  if ((telegramBotToken && !telegramChatId) || (!telegramBotToken && telegramChatId)) {
    return res.status(400).json({ message: "telegramBotToken and telegramChatId must be provided together." });
  }

  try {
    const monitor = cryptoMonitor.start(instId, {
      telegramBotToken,
      telegramChatId,
    });
    return res.json({ ok: true, monitor });
  } catch (err) {
    return res.status(400).json({
      message: err instanceof Error ? err.message : "Invalid monitorId.",
    });
  }
});

app.delete("/api/crypto/monitor/:monitorId", (req, res) => {
  const monitorId = decodeURIComponent(String(req.params.monitorId || "").trim());
  if (!monitorId) {
    return res.status(400).json({ message: "monitorId is required." });
  }

  try {
    const stoppedCount = cryptoMonitor.stop(monitorId);
    if (!stoppedCount) {
      return res.status(404).json({ message: "Monitor not found." });
    }
    return res.json({ ok: true, monitorId, stoppedCount });
  } catch (err) {
    return res.status(400).json({
      message: err instanceof Error ? err.message : "Invalid instId.",
    });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { symbolOrName, thesis, target } = req.body || {};
    const cleaned = String(symbolOrName || "").trim();

    if (!cleaned) {
      return res.status(400).json({ message: "Please enter a company name or ticker." });
    }

    const existing = findLatestReportBySymbolOrName(cleaned);
    if (existing) {
      return res.json({
        id: existing.id,
        createdAt: existing.createdAt,
        reused: true,
      });
    }

    const prompt = buildPrompt({
      symbolOrName: cleaned,
      thesis: String(thesis || "").trim(),
      target: String(target || "").trim(),
    });

    const markdown = await callGemini({
      apiKey: GEMINI_API_KEY,
      model: GEMINI_MODEL,
      baseUrl: GEMINI_BASE_URL,
      prompt,
    });

    const report = {
      id: crypto.randomUUID(),
      symbolOrName: cleaned,
      thesis: String(thesis || "").trim(),
      target: String(target || "").trim(),
      markdown,
      model: GEMINI_MODEL,
      createdAt: new Date().toISOString(),
    };

    saveReport(report);

    return res.json({
      id: report.id,
      createdAt: report.createdAt,
      reused: false,
    });
  } catch (err) {
    return res.status(500).json({
      message: err instanceof Error ? err.message : "Analysis failed. Please try again later.",
    });
  }
});

app.get("/api/reports", (req, res) => {
  const limit = Number(req.query.limit || 20);
  const list = listReports(Number.isFinite(limit) ? limit : 20).map((item) => ({
    id: item.id,
    symbolOrName: item.symbolOrName,
    createdAt: item.createdAt,
    thesis: item.thesis,
    target: item.target,
  }));
  res.json(list);
});

app.get("/api/reports/:id", (req, res) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ message: "Report not found." });
  }
  return res.json(report);
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!safeCompare(username, ADMIN_USERNAME) || !safeCompare(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const token = createAdminToken(username);
  setAdminCookie(res, token);
  return res.json({ ok: true, username });
});

app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  const username = getAdminUser(req);
  if (!username) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, username });
});

app.get("/api/admin/reports", requireAdminApi, (req, res) => {
  const limit = Number(req.query.limit || 200);
  const items = listReports(Number.isFinite(limit) ? limit : 200).map((item) => ({
    id: item.id,
    symbolOrName: item.symbolOrName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || null,
    model: item.model,
  }));
  res.json(items);
});

app.get("/api/admin/reports/:id", requireAdminApi, (req, res) => {
  const report = getReportById(req.params.id);
  if (!report) {
    return res.status(404).json({ message: "Report not found." });
  }
  return res.json(report);
});

app.post("/api/admin/reports", requireAdminApi, (req, res) => {
  const { symbolOrName, thesis, target, markdown, model } = req.body || {};
  const cleanedSymbolOrName = String(symbolOrName || "").trim();
  const cleanedMarkdown = String(markdown || "");

  if (!cleanedSymbolOrName) {
    return res.status(400).json({ message: "symbolOrName is required." });
  }
  if (!cleanedMarkdown.trim()) {
    return res.status(400).json({ message: "markdown is required." });
  }

  const report = {
    id: crypto.randomUUID(),
    symbolOrName: cleanedSymbolOrName,
    thesis: String(thesis || "").trim(),
    target: String(target || "").trim(),
    markdown: cleanedMarkdown,
    model: String(model || "manual").trim() || "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: req.adminUser || "admin",
    source: "manual",
  };

  saveReport(report);

  return res.status(201).json({
    ok: true,
    report,
  });
});

app.put("/api/admin/reports/:id", requireAdminApi, (req, res) => {
  const reportId = String(req.params.id || "");
  const { symbolOrName, thesis, target, markdown } = req.body || {};
  const updates = {};

  if (typeof symbolOrName === "string") {
    const cleaned = symbolOrName.trim();
    if (!cleaned) {
      return res.status(400).json({ message: "symbolOrName cannot be empty." });
    }
    updates.symbolOrName = cleaned;
  }
  if (typeof thesis === "string") {
    updates.thesis = thesis.trim();
  }
  if (typeof target === "string") {
    updates.target = target.trim();
  }
  if (typeof markdown === "string") {
    updates.markdown = markdown;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No valid fields to update." });
  }

  const updated = updateReportById(reportId, updates);
  if (!updated) {
    return res.status(404).json({ message: "Report not found." });
  }

  return res.json({
    ok: true,
    report: updated,
  });
});

app.delete("/api/admin/reports/:id", requireAdminApi, (req, res) => {
  const reportId = String(req.params.id || "");
  const deleted = deleteReportById(reportId);
  if (!deleted) {
    return res.status(404).json({ message: "Report not found." });
  }
  return res.json({ ok: true });
});

app.post("/api/admin/reports/:id/delete", requireAdminApi, (req, res) => {
  const reportId = String(req.params.id || "");
  const deleted = deleteReportById(reportId);
  if (!deleted) {
    return res.status(404).json({ message: "Report not found." });
  }
  return res.json({ ok: true });
});

app.get("/admin/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin-login.html"));
});

app.get("/manage", (_req, res) => {
  res.redirect("/admin/login");
});

app.get("/admin", requireAdminPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

app.get("/admin/edit/:id", requireAdminPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin-edit.html"));
});

app.get("/report/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "report.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
