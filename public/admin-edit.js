const form = document.getElementById("editForm");
const previewBtn = document.getElementById("previewBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const previewBody = document.getElementById("previewBody");
const editTitle = document.getElementById("editTitle");
const editMeta = document.getElementById("editMeta");

function getIdFromPath() {
  const chunks = window.location.pathname.split("/").filter(Boolean);
  return chunks[chunks.length - 1] || "";
}

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ff8d8d" : "";
}

async function ensureLogin() {
  const res = await fetch("/api/admin/me");
  if (!res.ok) {
    window.location.href = "/admin/login";
    throw new Error("未登录");
  }
}

function renderPreview(markdown) {
  if (typeof marked !== "undefined") {
    marked.setOptions({ gfm: true, breaks: true });
    previewBody.innerHTML = marked.parse(markdown || "");
  } else {
    previewBody.textContent = markdown || "";
  }
}

async function loadReport() {
  const id = getIdFromPath();
  if (!id) {
    setStatus("报告 ID 缺失", true);
    return;
  }

  const res = await fetch(`/api/admin/reports/${id}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "加载报告失败");
  }

  editTitle.textContent = `编辑报告 - ${data.symbolOrName}`;
  editMeta.textContent = `创建：${fmtTime(data.createdAt)} ${data.updatedAt ? `| 更新：${fmtTime(data.updatedAt)}` : ""}`;
  document.getElementById("symbolOrName").value = data.symbolOrName || "";
  document.getElementById("thesis").value = data.thesis || "";
  document.getElementById("target").value = data.target || "";
  document.getElementById("markdown").value = data.markdown || data.rawOutput || "";
  renderPreview(document.getElementById("markdown").value);
}

previewBtn.addEventListener("click", () => {
  renderPreview(document.getElementById("markdown").value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = getIdFromPath();
  if (!id) return;

  const payload = {
    symbolOrName: document.getElementById("symbolOrName").value.trim(),
    thesis: document.getElementById("thesis").value.trim(),
    target: document.getElementById("target").value.trim(),
    markdown: document.getElementById("markdown").value,
  };

  if (!payload.symbolOrName || !payload.markdown) {
    setStatus("公司名称和报告内容不能为空", true);
    return;
  }

  try {
    saveBtn.disabled = true;
    setStatus("保存中...");
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "保存失败");
    }
    setStatus("保存成功");
    renderPreview(payload.markdown);
  } catch (err) {
    setStatus(err.message || "保存失败", true);
  } finally {
    saveBtn.disabled = false;
  }
});

(async () => {
  try {
    await ensureLogin();
    await loadReport();
  } catch (err) {
    setStatus(err.message || "加载失败", true);
  }
})();
