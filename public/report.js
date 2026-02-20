function getIdFromPath() {
  const chunks = window.location.pathname.split("/").filter(Boolean);
  return chunks[chunks.length - 1] || "";
}

function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN");
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return html;
}

function stripLeadFluff(markdown) {
  const lines = String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const fluffPatterns = [
    /^(好的|当然|没问题|可以|以下|下面|这是|这是一份|根据).*(报告|分析).*(框架|要求|撰写|如下)?[。！!]*$/i,
    /^.*按照您提供.*(框架|要求).*[。！!]*$/i,
  ];

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") {
    i += 1;
  }

  if (i < lines.length) {
    const first = lines[i].trim();
    if (fluffPatterns.some((pattern) => pattern.test(first))) {
      lines.splice(i, 1);
      while (i < lines.length && lines[i].trim() === "") {
        lines.splice(i, 1);
      }
    }
  }

  return lines.join("\n");
}

function fallbackMarkdownToHtml(markdown) {
  const lines = String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out = [];
  let paragraph = [];
  let listItems = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const content = paragraph.map((line) => renderInline(line.trim())).join("<br>");
    out.push(`<p>${content}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    const lis = listItems.map((item) => `<li>${renderInline(item)}</li>`).join("");
    out.push(`<ul>${lis}</ul>`);
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trim = line.trim();

    if (!trim) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trim.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trim)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      continue;
    }

    const listItem = trim.match(/^[-*+]\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1].trim());
      continue;
    }

    if (listItems.length) {
      listItems[listItems.length - 1] += ` ${trim}`;
    } else {
      paragraph.push(trim);
    }
  }

  flushParagraph();
  flushList();

  return out.join("\n");
}

function markdownToHtml(markdown) {
  if (typeof marked !== "undefined") {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
    return marked.parse(markdown);
  }
  return fallbackMarkdownToHtml(markdown);
}

async function renderReport() {
  const id = getIdFromPath();
  const title = document.getElementById("title");
  const meta = document.getElementById("meta");
  const body = document.getElementById("reportBody");

  if (!id) {
    body.textContent = "Report ID is missing.";
    return;
  }

  try {
    const res = await fetch(`/api/reports/${id}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.message || "Failed to load report.");
    }

    title.textContent = `分析报告 - ${data.symbolOrName}`;
    meta.textContent = `生成时间：${fmtTime(data.createdAt)} | 分析师：火眼`;

    const markdown = stripLeadFluff(data.markdown || data.rawOutput || "No report content.");
    body.innerHTML = markdownToHtml(markdown);
  } catch (err) {
    body.textContent = err.message || "Report loading failed.";
  }
}

renderReport();
