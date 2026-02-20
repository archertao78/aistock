const form = document.getElementById("analyzeForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const historyList = document.getElementById("historyList");
const refreshHistoryBtn = document.getElementById("refreshHistory");

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ff8d8d" : "";
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

async function findLatestExistingReportId(symbolOrName) {
  const res = await fetch("/api/reports?limit=1000", { cache: "no-store" });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list)) return null;
  const hit = list.find((row) => matchesSymbolOrName(symbolOrName, row.symbolOrName));
  return hit?.id || null;
}

async function loadHistory() {
  try {
    const res = await fetch("/api/reports?limit=30");
    const list = await res.json();
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
        <a href="/report/${row.id}" target="_blank" rel="noopener noreferrer">${row.symbolOrName}</a>
        <span class="meta">${fmtTime(row.createdAt)}</span>
      `;
      historyList.appendChild(li);
    });
  } catch (_err) {
    historyList.innerHTML = '<li class="history-item">历史加载失败</li>';
  }
}

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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || "提交失败");
    }

    if (data?.reused) {
      setStatus("已存在同名报告，正在打开最新报告...");
    } else {
      setStatus("报告已生成，正在打开...");
    }
    await loadHistory();
    window.open(`/report/${data.id}`, "_blank", "noopener,noreferrer");
  } catch (err) {
    setStatus(err.message || "分析失败", true);
  } finally {
    submitBtn.disabled = false;
  }
});

refreshHistoryBtn.addEventListener("click", () => {
  loadHistory();
});

loadHistory();
