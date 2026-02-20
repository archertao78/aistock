const form = document.getElementById("adminLoginForm");
const statusEl = document.getElementById("status");
const loginBtn = document.getElementById("loginBtn");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#ff8d8d" : "";
}

async function checkLogin() {
  try {
    const res = await fetch("/api/admin/me");
    if (res.ok) {
      window.location.href = "/admin";
    }
  } catch (_err) {
    // Ignore initial check failure.
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
  };

  if (!payload.username || !payload.password) {
    setStatus("请输入用户名和密码", true);
    return;
  }

  try {
    loginBtn.disabled = true;
    setStatus("登录中...");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "登录失败");
    }
    setStatus("登录成功，正在跳转...");
    window.location.href = "/admin";
  } catch (err) {
    setStatus(err.message || "登录失败", true);
  } finally {
    loginBtn.disabled = false;
  }
});

checkLogin();
