const form = document.getElementById("analyzeForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const historyList = document.getElementById("historyList");
const refreshHistoryBtn = document.getElementById("refreshHistory");

const cryptoForm = document.getElementById("cryptoForm");
const cryptoInput = document.getElementById("cryptoInstId");
const telegramBotTokenInput = document.getElementById("telegramBotToken");
const telegramChatIdInput = document.getElementById("telegramChatId");
const cryptoSubmitBtn = document.getElementById("cryptoSubmitBtn");
const cryptoStatusEl = document.getElementById("cryptoStatus");
const cryptoList = document.getElementById("cryptoMonitorList");
const cryptoRefreshBtn = document.getElementById("cryptoRefresh");

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ff8d8d" : "";
}

function setCryptoStatus(text, isError = false) {
  if (!cryptoStatusEl) return;
  cryptoStatusEl.textContent = text;
  cryptoStatusEl.style.color = isError ? "#ff8d8d" : "";
}

function normalizeSymbolOrName(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isTickerLike(input) {
  const value = String(input || "").trim();
  if (!value || /\s/.test(value)) return false;
  return /^[a-z][a-z0-9.\-]{0,9}$/i.test(value);
}

function matchesSymbolOrName(query, candidate) {
  const q = normalizeSymbolOrName(query);
  const c = normalizeSymbolOrName(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  if (!isTickerLike(q)) return false;
  return c.startsWith(`${q} `) || c.includes(`(${q})`) || c.includes(`[${q}]`);
}

function normalizeInstId(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, "-")
    .replace(/\s+/g, "");
  if (!raw) return "";
  return raw.includes("-") ? raw : `${raw}-USDT`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function signalTypeLabel(type) {
  if (type === "golden_cross") return "金叉";
  if (type === "death_cross") return "死叉";
  return "无";
}

async function readJsonOrThrow(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error("服务返回的不是 JSON，请确认后端接口已部署并重启。");
  }

  try {
    return JSON.parse(text);
  } catch (_err) {
    throw new Error("接口返回 JSON 解析失败。");
  }
}

async function findLatestExistingReportId(symbolOrName) {
  const res = await fetch("/api/reports?limit=1000", { cache: "no-store" });
  if (!res.ok) return null;
  const list = await readJsonOrThrow(res);
  if (!Array.isArray(list)) return null;
  const hit = list.find((row) => matchesSymbolOrName(symbolOrName, row.symbolOrName));
  return hit?.id || null;
}

async function loadHistory() {
  if (!historyList) return;

  try {
    const res = await fetch("/api/reports?limit=30");
    const list = await readJsonOrThrow(res);
    historyList.innerHTML = "";

    if (!Array.isArray(list) || list.length === 0) {
      const item = document.createElement("li");
      item.className = "history-item";
      item.textContent = "暂无历史报告";
      historyList.appendChild(item);
      return;
    }

    list.forEach((row) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `
        <a href="/report/${row.id}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.symbolOrName)}</a>
        <span class="meta">${fmtTime(row.createdAt)}</span>
      `;
      historyList.appendChild(li);
    });
  } catch (err) {
    historyList.innerHTML = `<li class="history-item">${escapeHtml(err.message || "历史加载失败")}</li>`;
  }
}

async function loadCryptoMonitors() {
  if (!cryptoList) return;

  try {
    const res = await fetch("/api/crypto/monitor", { cache: "no-store" });
    const data = await readJsonOrThrow(res);

    if (!res.ok) {
      throw new Error(data?.message || "加载盯盘列表失败");
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    cryptoList.innerHTML = "";

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "history-item";
      li.textContent = "暂无运行中的盯盘任务";
      cryptoList.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item monitor-item";

      const signalText = item.lastSignalType
        ? `${signalTypeLabel(item.lastSignalType)} @ ${fmtTime(item.lastSignalAt)}`
        : "暂无";

      li.innerHTML = `
        <div class="monitor-main">
          <strong>${escapeHtml(item.instId)}</strong>
          <span class="meta">任务ID: ${escapeHtml(item.monitorId || "")}</span>
          <span class="meta">Telegram Chat: ${escapeHtml(item.telegramChatIdMasked || "默认环境变量")}</span>
          <span class="meta">启动时间: ${fmtTime(item.startedAt)}</span>
          <span class="meta">最近检查: ${item.lastCheckedAt ? fmtTime(item.lastCheckedAt) : "尚未执行"}</span>
          <span class="meta">最近信号: ${signalText}</span>
        </div>
        <button class="ghost" type="button" data-monitor-id="${escapeHtml(item.monitorId || "")}">停止</button>
      `;

      cryptoList.appendChild(li);
    });
  } catch (err) {
    cryptoList.innerHTML = `<li class="history-item">${escapeHtml(err.message || "盯盘列表加载失败")}</li>`;
  }
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      symbolOrName: document.getElementById("symbolOrName").value.trim(),
    };

    if (!payload.symbolOrName) {
      setStatus("请先输入公司名称或股票代码", true);
      return;
    }

    try {
      submitBtn.disabled = true;
      setStatus("分析中，请稍候...");

      const existingId = await findLatestExistingReportId(payload.symbolOrName);
      if (existingId) {
        setStatus("已存在同名报告，正在打开最新报告...");
        window.open(`/report/${existingId}`, "_blank", "noopener,noreferrer");
        return;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonOrThrow(res);
      if (!res.ok) {
        throw new Error(data?.message || "提交失败");
      }

      setStatus(data?.reused ? "已存在同名报告，正在打开最新报告..." : "报告已生成，正在打开...");
      await loadHistory();
      window.open(`/report/${data.id}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setStatus(err.message || "分析失败", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener("click", () => {
    loadHistory();
  });
}

if (cryptoForm) {
  cryptoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const instId = normalizeInstId(cryptoInput?.value || "");
    const telegramBotToken = String(telegramBotTokenInput?.value || "").trim();
    const telegramChatId = String(telegramChatIdInput?.value || "").trim();

    if (!instId) {
      setCryptoStatus("请输入交易对，例如 BTC-USDT", true);
      return;
    }
    if (!telegramBotToken || !telegramChatId) {
      setCryptoStatus("请填写 Telegram Bot Token 和 Chat ID", true);
      return;
    }

    try {
      cryptoSubmitBtn.disabled = true;
      setCryptoStatus(`正在启动 ${instId} 盯盘...`);

      const res = await fetch("/api/crypto/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instId, telegramBotToken, telegramChatId }),
      });

      const data = await readJsonOrThrow(res);
      if (!res.ok) {
        throw new Error(data?.message || "启动盯盘失败");
      }

      setCryptoStatus(`${data?.monitor?.instId || instId} 已启动，每 1 分钟执行一次并推送 Telegram`);
      await loadCryptoMonitors();
    } catch (err) {
      setCryptoStatus(err.message || "启动盯盘失败", true);
    } finally {
      cryptoSubmitBtn.disabled = false;
    }
  });
}

if (cryptoRefreshBtn) {
  cryptoRefreshBtn.addEventListener("click", () => {
    loadCryptoMonitors();
  });
}

if (cryptoList) {
  cryptoList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const btn = target.closest("button[data-monitor-id]");
    if (!btn) return;

    const monitorId = String(btn.getAttribute("data-monitor-id") || "").trim();
    if (!monitorId) return;

    try {
      btn.disabled = true;
      const res = await fetch(`/api/crypto/monitor/${encodeURIComponent(monitorId)}`, {
        method: "DELETE",
      });
      const data = await readJsonOrThrow(res);

      if (!res.ok) {
        throw new Error(data?.message || "停止盯盘失败");
      }

      setCryptoStatus("盯盘任务已停止");
      await loadCryptoMonitors();
    } catch (err) {
      setCryptoStatus(err.message || "停止盯盘失败", true);
    } finally {
      btn.disabled = false;
    }
  });
}

loadHistory();
loadCryptoMonitors();
