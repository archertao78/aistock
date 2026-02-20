const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "db", "reports.json");

function ensureDbFile() {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, "[]", "utf8");
  }
}

function readReports() {
  ensureDbFile();
  const raw = fs.readFileSync(dbPath, "utf8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_err) {
    return [];
  }
}

function writeReports(reports) {
  ensureDbFile();
  fs.writeFileSync(dbPath, JSON.stringify(reports, null, 2), "utf8");
}

function saveReport(report) {
  const reports = readReports();
  reports.unshift(report);
  writeReports(reports);
}

function getReportById(id) {
  const reports = readReports();
  return reports.find((item) => item.id === id) || null;
}

function listReports(limit = 20) {
  const reports = readReports();
  return reports.slice(0, limit);
}

function normalizeSymbolOrName(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isTickerLike(input) {
  const value = String(input || "").trim();
  if (!value || /\s/.test(value)) {
    return false;
  }
  return /^[a-z][a-z0-9.\-]{0,9}$/i.test(value);
}

function matchesSymbolOrName(query, candidate) {
  const q = normalizeSymbolOrName(query);
  const c = normalizeSymbolOrName(candidate);
  if (!q || !c) {
    return false;
  }

  if (q === c) {
    return true;
  }

  // Strict mode:
  // 1) If query looks like ticker code, allow common name forms containing ticker.
  // 2) If query is a full company name phrase, only exact match is allowed.
  if (!isTickerLike(q)) {
    return false;
  }

  return c.startsWith(`${q} `) || c.includes(`(${q})`) || c.includes(`[${q}]`);
}

function findLatestReportBySymbolOrName(symbolOrName) {
  const query = String(symbolOrName || "").trim();
  if (!query) {
    return null;
  }
  const reports = readReports();
  return reports.find((item) => matchesSymbolOrName(query, item.symbolOrName)) || null;
}

function updateReportById(id, updates) {
  const reports = readReports();
  const idx = reports.findIndex((item) => item.id === id);
  if (idx === -1) {
    return null;
  }

  const current = reports[idx];
  const next = {
    ...current,
    ...updates,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };

  reports[idx] = next;
  writeReports(reports);
  return next;
}

function deleteReportById(id) {
  const reports = readReports();
  const idx = reports.findIndex((item) => item.id === id);
  if (idx === -1) {
    return false;
  }
  reports.splice(idx, 1);
  writeReports(reports);
  return true;
}

module.exports = {
  saveReport,
  getReportById,
  listReports,
  findLatestReportBySymbolOrName,
  updateReportById,
  deleteReportById,
};
