const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const filesDbPath = path.join(__dirname, "..", "db", "files.json");
const uploadsDir = path.join(__dirname, "..", "uploads");

function ensureStore() {
  const dbDir = path.dirname(filesDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(filesDbPath)) {
    fs.writeFileSync(filesDbPath, "[]", "utf8");
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function initFileStore() {
  ensureStore();
}

function getUploadsDir() {
  ensureStore();
  return uploadsDir;
}

function readFileItems() {
  ensureStore();
  const raw = fs.readFileSync(filesDbPath, "utf8");
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_err) {
    return [];
  }
}

function writeFileItems(items) {
  ensureStore();
  fs.writeFileSync(filesDbPath, JSON.stringify(items, null, 2), "utf8");
}

function normalizeMimeType(input) {
  const value = String(input || "").trim().toLowerCase();
  return value || "application/octet-stream";
}

function getFileKind(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("text/")) return "text";
  if (normalized === "application/json") return "text";
  return "other";
}

function safeFilePath(inputPath) {
  const fullPath = path.resolve(String(inputPath || ""));
  const rootPath = path.resolve(uploadsDir);
  const normalizedFull = path.normalize(fullPath);
  const normalizedRoot = path.normalize(rootPath);
  const compareFull = process.platform === "win32" ? normalizedFull.toLowerCase() : normalizedFull;
  const compareRoot = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;

  if (compareFull === compareRoot) {
    return fullPath;
  }
  if (!compareFull.startsWith(`${compareRoot}${path.sep}`)) {
    throw new Error("Invalid upload path.");
  }
  return fullPath;
}

function addUploadedFile(item) {
  const now = new Date().toISOString();
  const filePath = safeFilePath(item.filePath);
  const mimeType = normalizeMimeType(item.mimeType);

  const record = {
    id: crypto.randomUUID(),
    originalName: String(item.originalName || "file"),
    storedName: path.basename(filePath),
    filePath,
    mimeType,
    kind: getFileKind(mimeType),
    size: Number(item.size || 0),
    createdAt: now,
  };

  const items = readFileItems();
  items.unshift(record);
  writeFileItems(items);
  return record;
}

function listUploadedFiles(limit = 200) {
  const max = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 200;
  const items = readFileItems();
  return items.slice(0, max);
}

function getUploadedFileById(id) {
  const fileId = String(id || "").trim();
  if (!fileId) return null;
  const items = readFileItems();
  return items.find((item) => item.id === fileId) || null;
}

function deleteUploadedFileById(id) {
  const fileId = String(id || "").trim();
  if (!fileId) return false;

  const items = readFileItems();
  const idx = items.findIndex((item) => item.id === fileId);
  if (idx === -1) {
    return false;
  }

  const [removed] = items.splice(idx, 1);
  writeFileItems(items);

  try {
    const fullPath = safeFilePath(removed.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (_err) {
    // Keep metadata consistent even if file was already missing.
  }

  return true;
}

module.exports = {
  initFileStore,
  getUploadsDir,
  addUploadedFile,
  listUploadedFiles,
  getUploadedFileById,
  deleteUploadedFileById,
};
