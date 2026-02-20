const adminMeta = document.getElementById("adminMeta");
const reportList = document.getElementById("adminReportList");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

async function ensureLogin() {
  const res = await fetch("/api/admin/me");
  if (!res.ok) {
    window.location.href = "/admin/login";
    throw new Error("Not logged in");
  }
  const data = await res.json();
  adminMeta.textContent = `Current admin: ${data.username}`;
}

async function deleteReport(id, symbolOrName) {
  const yes = window.confirm(`Delete report "${symbolOrName}"? This cannot be undone.`);
  if (!yes) return;

  const primary = await fetch(`/api/admin/reports/${id}`, {
    method: "DELETE",
    cache: "no-store",
  });

  if (primary.ok) {
    return;
  }

  const fallback = await fetch(`/api/admin/reports/${id}/delete`, {
    method: "POST",
    cache: "no-store",
  });
  const data = await fallback.json().catch(() => ({}));
  if (!fallback.ok) {
    throw new Error(data?.message || "Delete failed");
  }
}

async function loadReports() {
  const res = await fetch(`/api/admin/reports?limit=500&t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    reportList.innerHTML = '<li class="history-item">Load failed. Please login again.</li>';
    return;
  }
  const rows = await res.json();
  reportList.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    reportList.innerHTML = '<li class="history-item">No reports.</li>';
    return;
  }

  rows.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item admin-report-item";
    li.innerHTML = `
      <div class="admin-report-main">
        <strong>${item.symbolOrName}</strong>
        <span class="meta">Created: ${fmtTime(item.createdAt)} ${item.updatedAt ? `| Updated: ${fmtTime(item.updatedAt)}` : ""}</span>
      </div>
      <div class="admin-report-actions">
        <a href="/report/${item.id}" target="_blank" rel="noopener noreferrer">View</a>
        <a href="/admin/edit/${item.id}">Edit</a>
        <button class="ghost danger delete-btn" type="button" data-id="${item.id}" data-name="${item.symbolOrName}">Delete</button>
      </div>
    `;
    reportList.appendChild(li);
  });

  reportList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const name = btn.getAttribute("data-name") || id;
      try {
        btn.disabled = true;
        await deleteReport(id, name);
        window.location.reload();
      } catch (err) {
        alert(err.message || "Delete failed");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

refreshBtn.addEventListener("click", () => {
  loadReports();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/admin/login";
});

(async () => {
  try {
    await ensureLogin();
    await loadReports();
  } catch (_err) {
    // Redirect handled in ensureLogin
  }
})();
