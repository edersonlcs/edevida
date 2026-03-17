const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

function sanitizeFileName(name) {
  return String(name || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120);
}

function getUploadDir() {
  return path.resolve(__dirname, "../../../../temp/uploads");
}

async function ensureUploadDir() {
  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

async function saveUploadedFile(file) {
  if (!file?.buffer || !file.originalname) {
    throw new Error("Arquivo invalido para upload");
  }

  const uploadDir = await ensureUploadDir();
  const safeName = sanitizeFileName(file.originalname);
  const fileName = `${Date.now()}-${randomUUID()}-${safeName}`;
  const absolutePath = path.join(uploadDir, fileName);

  await fs.writeFile(absolutePath, file.buffer);

  return {
    absolutePath,
    localFileUrl: `local://temp/uploads/${fileName}`,
    fileName,
    mimeType: file.mimetype || "application/octet-stream",
    size: file.size || file.buffer.length,
  };
}

module.exports = {
  saveUploadedFile,
};
