const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const fileStatus = document.getElementById("fileStatus");
const fileList = document.getElementById("fileList");

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(text, isError = false) {
  if (!fileStatus) return;
  fileStatus.textContent = text;
  fileStatus.style.color = isError ? "#ff8d8d" : "";
}

function formatBytes(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || "") : d.toLocaleString("zh-CN");
}

async function readJsonOrThrow(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error("接口未返回 JSON 数据");
  }
  try {
    return JSON.parse(text);
  } catch (_err) {
    throw new Error("接口 JSON 解析失败");
  }
}

function buildPreview(item) {
  const contentUrl = String(item.contentUrl || "");
  if (!contentUrl) {
    return "<p class='meta'>不可预览</p>";
  }

  if (item.kind === "video") {
    return `<video controls preload="metadata" src="${contentUrl}"></video>`;
  }
  if (item.kind === "audio") {
    return `<audio controls preload="metadata" src="${contentUrl}"></audio>`;
  }
  if (item.kind === "image") {
    return `<img src="${contentUrl}" alt="${escapeHtml(item.originalName || "image")}" loading="lazy" />`;
  }
  if (item.kind === "text") {
    return `<a class="ghost-link" href="${contentUrl}" target="_blank" rel="noopener noreferrer">查看文本</a>`;
  }

  return "<p class='meta'>该类型暂不支持页面内预览</p>";
}

function renderList(items) {
  if (!fileList) return;
  fileList.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.textContent = "暂无已上传文件";
    fileList.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item file-item";
    li.innerHTML = `
      <div class="file-preview">${buildPreview(item)}</div>
      <div class="file-main">
        <strong>${escapeHtml(item.originalName || "unknown")}</strong>
        <span class="meta">类型: ${escapeHtml(item.mimeType || "application/octet-stream")} (${escapeHtml(item.kind || "other")})</span>
        <span class="meta">大小: ${formatBytes(item.size)}</span>
        <span class="meta">上传时间: ${escapeHtml(fmtTime(item.createdAt))}</span>
      </div>
      <div class="file-actions">
        <a class="ghost-link" href="${escapeHtml(item.downloadUrl || "#")}">下载</a>
        <button class="ghost danger delete-file-btn" type="button" data-file-id="${escapeHtml(item.id || "")}">删除</button>
      </div>
    `;
    fileList.appendChild(li);
  });
}

async function loadFiles() {
  try {
    const response = await fetch("/api/files?limit=500", { cache: "no-store" });
    const data = await readJsonOrThrow(response);
    if (!response.ok) {
      throw new Error(data?.message || "加载文件列表失败");
    }
    renderList(data.items || []);
  } catch (err) {
    renderList([]);
    setStatus(err.message || "加载文件列表失败", true);
  }
}

if (uploadForm) {
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = fileInput?.files?.[0];
    if (!file) {
      setStatus("请先选择文件", true);
      return;
    }

    try {
      uploadBtn.disabled = true;
      setStatus("正在上传...");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonOrThrow(response);

      if (!response.ok) {
        throw new Error(data?.message || "上传失败");
      }

      setStatus("上传成功");
      if (fileInput) {
        fileInput.value = "";
      }
      await loadFiles();
    } catch (err) {
      setStatus(err.message || "上传失败", true);
    } finally {
      uploadBtn.disabled = false;
    }
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadFiles();
  });
}

if (fileList) {
  fileList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const btn = target.closest("button[data-file-id]");
    if (!btn) return;

    const fileId = String(btn.getAttribute("data-file-id") || "").trim();
    if (!fileId) return;

    const ok = window.confirm("确认删除该文件吗？删除后不可恢复。");
    if (!ok) return;

    try {
      btn.disabled = true;
      setStatus("正在删除...");
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
      const data = await readJsonOrThrow(response);

      if (!response.ok) {
        throw new Error(data?.message || "删除失败");
      }

      setStatus("删除成功");
      await loadFiles();
    } catch (err) {
      setStatus(err.message || "删除失败", true);
      btn.disabled = false;
    }
  });
}

loadFiles();
