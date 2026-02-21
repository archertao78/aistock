const form = document.getElementById("editForm");
const previewBtn = document.getElementById("previewBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const previewBody = document.getElementById("previewBody");
const editTitle = document.getElementById("editTitle");
const editMeta = document.getElementById("editMeta");

function getPathParts() {
  return window.location.pathname.split("/").filter(Boolean);
}

function getEditId() {
  const parts = getPathParts();
  if (parts.length >= 3 && parts[0] === "admin" && parts[1] === "edit") {
    return decodeURIComponent(parts[2]);
  }
  return "";
}

function isCreateMode() {
  const parts = getPathParts();
  return parts.length >= 2 && parts[0] === "admin" && parts[1] === "new";
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
    throw new Error("Not logged in");
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

function fillForm(data) {
  document.getElementById("symbolOrName").value = data.symbolOrName || "";
  document.getElementById("thesis").value = data.thesis || "";
  document.getElementById("target").value = data.target || "";
  document.getElementById("markdown").value = data.markdown || data.rawOutput || "";
  renderPreview(document.getElementById("markdown").value);
}

async function loadExistingReport() {
  const id = getEditId();
  if (!id) {
    throw new Error("Missing report id.");
  }

  const res = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Failed to load report.");
  }

  editTitle.textContent = `编辑报告 - ${data.symbolOrName || id}`;
  editMeta.textContent = `创建: ${fmtTime(data.createdAt)}${data.updatedAt ? ` | 更新: ${fmtTime(data.updatedAt)}` : ""}`;
  saveBtn.textContent = "保存修改";
  fillForm(data);
}

function initCreateMode() {
  editTitle.textContent = "新增报告";
  editMeta.textContent = "手动录入后将直接保存到数据库。";
  saveBtn.textContent = "创建报告";
  fillForm({});
}

previewBtn.addEventListener("click", () => {
  renderPreview(document.getElementById("markdown").value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const createMode = isCreateMode();
  const id = getEditId();

  const payload = {
    symbolOrName: document.getElementById("symbolOrName").value.trim(),
    thesis: document.getElementById("thesis").value.trim(),
    target: document.getElementById("target").value.trim(),
    markdown: document.getElementById("markdown").value,
  };

  if (!payload.symbolOrName || !payload.markdown.trim()) {
    setStatus("公司名称和报告内容不能为空。", true);
    return;
  }

  try {
    saveBtn.disabled = true;
    setStatus(createMode ? "创建中..." : "保存中...");

    const url = createMode ? "/api/admin/reports" : `/api/admin/reports/${encodeURIComponent(id)}`;
    const method = createMode ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Save failed.");
    }

    if (createMode) {
      const newId = data?.report?.id;
      setStatus("创建成功");
      if (newId) {
        window.location.href = `/admin/edit/${encodeURIComponent(newId)}`;
        return;
      }
      window.location.href = "/admin";
      return;
    }

    setStatus("保存成功");
    renderPreview(payload.markdown);
  } catch (err) {
    setStatus(err.message || "Save failed.", true);
  } finally {
    saveBtn.disabled = false;
  }
});

(async () => {
  try {
    await ensureLogin();
    if (isCreateMode()) {
      initCreateMode();
      return;
    }
    await loadExistingReport();
  } catch (err) {
    setStatus(err.message || "Load failed.", true);
  }
})();
