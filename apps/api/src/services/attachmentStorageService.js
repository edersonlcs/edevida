const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const sharp = require("sharp");
const { supabase } = require("../integrations/supabaseClient");
const { cfg } = require("../config/env");

const LOCAL_PREFIX = "local://temp/uploads/";
const SUPABASE_PREFIX = "supabase://";

const bucketCache = {
  name: "",
  checkedAt: 0,
};

function sanitizeFileName(name) {
  return String(name || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120);
}

function extnameSafe(name) {
  const ext = path.extname(name || "").toLowerCase();
  return ext || "";
}

function isImageFile(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) return true;

  const ext = extnameSafe(file?.originalname);
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext);
}

function getUploadDir() {
  return path.resolve(__dirname, "../../../../temp/uploads");
}

async function ensureUploadDir() {
  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

function getStorageBucketName() {
  return String(cfg.supabaseStorageBucket || "").trim() || "edevida-private";
}

function isSupabaseStorageEnabled() {
  return Boolean(cfg.supabaseStorageEnabled && cfg.supabaseUrl && cfg.supabaseServiceRoleKey && getStorageBucketName());
}

function asLocalCanonicalUrl(fileName) {
  return `${LOCAL_PREFIX}${fileName}`;
}

function asSupabaseCanonicalUrl(bucket, objectPath) {
  return `${SUPABASE_PREFIX}${bucket}/${objectPath}`;
}

function extractLocalFileNameFromUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw) return "";

  if (raw.startsWith(LOCAL_PREFIX)) {
    return path.basename(raw.slice(LOCAL_PREFIX.length));
  }

  if (raw.startsWith("/uploads/")) {
    return path.basename(raw.slice("/uploads/".length));
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname || "";
    if (pathname.startsWith("/uploads/")) {
      return path.basename(pathname.slice("/uploads/".length));
    }
  } catch {
    // ignore invalid absolute URL
  }

  return "";
}

function parseSupabaseCanonicalUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw.startsWith(SUPABASE_PREFIX)) return null;

  const value = raw.slice(SUPABASE_PREFIX.length);
  const slashIdx = value.indexOf("/");
  if (slashIdx <= 0) return null;

  const bucket = value.slice(0, slashIdx).trim();
  const objectPath = value.slice(slashIdx + 1).trim();
  if (!bucket || !objectPath) return null;

  return { bucket, objectPath };
}

function normalizeIncomingFileUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw) return null;

  if (raw.startsWith("/api/files/open?")) {
    const query = raw.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const nested = params.get("file_url");
    if (nested) return normalizeIncomingFileUrl(nested);
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === "/api/files/open") {
      const nested = parsed.searchParams.get("file_url");
      if (nested) return normalizeIncomingFileUrl(nested);
    }
  } catch {
    // ignore invalid absolute URL
  }

  const supa = parseSupabaseCanonicalUrl(raw);
  if (supa) {
    return asSupabaseCanonicalUrl(supa.bucket, supa.objectPath);
  }

  const localFileName = extractLocalFileNameFromUrl(raw);
  if (localFileName) {
    return asLocalCanonicalUrl(localFileName);
  }

  return raw;
}

function isCanonicalInternalFileUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  return raw.startsWith(LOCAL_PREFIX) || raw.startsWith(SUPABASE_PREFIX);
}

function toFileOpenUrl(fileUrl) {
  const canonical = normalizeIncomingFileUrl(fileUrl);
  if (!canonical) return null;

  if (isCanonicalInternalFileUrl(canonical)) {
    return `/api/files/open?file_url=${encodeURIComponent(canonical)}`;
  }

  return canonical;
}

function localToWebFileUrl(localFileUrl) {
  const localFileName = extractLocalFileNameFromUrl(localFileUrl);
  if (!localFileName) return localFileUrl;
  return `/uploads/${localFileName}`;
}

function uploadUrlToAbsolutePath(fileUrl) {
  const fileName = extractLocalFileNameFromUrl(fileUrl);
  if (!fileName) return null;
  const uploadDir = getUploadDir();
  const absolutePath = path.resolve(uploadDir, fileName);
  if (!absolutePath.startsWith(uploadDir)) return null;
  return absolutePath;
}

async function ensureSupabaseBucket() {
  if (!isSupabaseStorageEnabled()) return;

  const bucketName = getStorageBucketName();
  const now = Date.now();
  if (bucketCache.name === bucketName && now - bucketCache.checkedAt < 5 * 60 * 1000) {
    return;
  }

  const { data, error } = await supabase.storage.getBucket(bucketName);
  if (error || !data) {
    const message = String(error?.message || "");
    const notFound = /not\s*found|does not exist|404/i.test(message);

    if (!notFound) {
      throw new Error(`Erro ao validar bucket '${bucketName}': ${message || "desconhecido"}`);
    }

    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
    });

    if (createError) {
      const createMessage = String(createError.message || "");
      if (!/already exists|duplicate/i.test(createMessage)) {
        throw new Error(`Erro ao criar bucket '${bucketName}': ${createMessage || "desconhecido"}`);
      }
    }
  }

  bucketCache.name = bucketName;
  bucketCache.checkedAt = now;
}

async function deleteUploadedFileByUrl(fileUrl) {
  const normalized = normalizeIncomingFileUrl(fileUrl);
  if (!normalized) return false;

  const supa = parseSupabaseCanonicalUrl(normalized);
  if (supa) {
    const { error } = await supabase.storage.from(supa.bucket).remove([supa.objectPath]);
    if (error && !/not\s*found|404/i.test(String(error.message || ""))) {
      throw new Error(`Erro ao remover arquivo do Supabase Storage: ${error.message}`);
    }
    return !error;
  }

  const absolutePath = uploadUrlToAbsolutePath(normalized);
  if (!absolutePath) return false;

  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function resolveFileUrlForAccess(fileUrl, options = {}) {
  const normalized = normalizeIncomingFileUrl(fileUrl);
  if (!normalized) return null;

  const supa = parseSupabaseCanonicalUrl(normalized);
  if (supa) {
    const ttl = Number(options.ttlSeconds || cfg.supabaseStorageSignedUrlTtlSeconds || 900);
    const expiresIn = Number.isFinite(ttl) && ttl > 0 ? Math.min(Math.round(ttl), 60 * 60 * 24) : 900;

    const { data, error } = await supabase.storage.from(supa.bucket).createSignedUrl(supa.objectPath, expiresIn);
    if (error || !data?.signedUrl) {
      throw new Error(`Erro ao gerar URL assinada do anexo: ${error?.message || "sem signedUrl"}`);
    }

    return data.signedUrl;
  }

  if (normalized.startsWith(LOCAL_PREFIX) || normalized.startsWith("/uploads/")) {
    return localToWebFileUrl(normalized);
  }

  return normalized;
}

async function optimizeImageIfPossible(file) {
  if (!isImageFile(file)) {
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
      extension: extnameSafe(file.originalname) || ".bin",
      optimized: false,
    };
  }

  try {
    const originalSize = file.buffer.length;
    const optimizedBuffer = await sharp(file.buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 74, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();

    if (optimizedBuffer.length < originalSize * 0.98) {
      return {
        buffer: optimizedBuffer,
        mimeType: "image/jpeg",
        extension: ".jpg",
        optimized: true,
      };
    }

    return {
      buffer: file.buffer,
      mimeType: file.mimetype || "image/jpeg",
      extension: extnameSafe(file.originalname) || ".jpg",
      optimized: false,
    };
  } catch {
    return {
      buffer: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
      extension: extnameSafe(file.originalname) || ".bin",
      optimized: false,
    };
  }
}

async function saveToSupabaseStorage(file, optimized, { folder = "anexos" } = {}) {
  await ensureSupabaseBucket();

  const bucketName = getStorageBucketName();
  const baseName = sanitizeFileName(file.originalname).replace(/\.[^.]+$/, "");
  const extension = optimized.extension || ".bin";
  const datePart = new Date().toISOString().slice(0, 10);
  const objectPath = `${folder}/${datePart}/${Date.now()}-${randomUUID()}-${baseName}${extension}`;

  const { error } = await supabase.storage.from(bucketName).upload(objectPath, optimized.buffer, {
    contentType: optimized.mimeType || file.mimetype || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`Erro ao salvar anexo no Supabase Storage: ${error.message}`);
  }

  const canonicalFileUrl = asSupabaseCanonicalUrl(bucketName, objectPath);

  return {
    absolutePath: null,
    localFileUrl: null,
    fileUrl: canonicalFileUrl,
    webFileUrl: toFileOpenUrl(canonicalFileUrl),
    storageProvider: "supabase",
    bucket: bucketName,
    objectPath,
    fileName: path.basename(objectPath),
    mimeType: optimized.mimeType || file.mimetype || "application/octet-stream",
    size: optimized.buffer.length,
    originalSize: file.size || file.buffer.length,
    optimized: optimized.optimized,
  };
}

async function saveToLocalStorage(file, optimized) {
  const uploadDir = await ensureUploadDir();
  const baseName = sanitizeFileName(file.originalname).replace(/\.[^.]+$/, "");
  const extension = optimized.extension || ".bin";
  const fileName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
  const absolutePath = path.join(uploadDir, fileName);

  await fs.writeFile(absolutePath, optimized.buffer);
  const localFileUrl = asLocalCanonicalUrl(fileName);

  return {
    absolutePath,
    localFileUrl,
    fileUrl: localFileUrl,
    webFileUrl: toFileOpenUrl(localFileUrl),
    storageProvider: "local",
    fileName,
    mimeType: optimized.mimeType || file.mimetype || "application/octet-stream",
    size: optimized.buffer.length,
    originalSize: file.size || file.buffer.length,
    optimized: optimized.optimized,
  };
}

async function saveUploadedFile(file, options = {}) {
  if (!file?.buffer || !file.originalname) {
    throw new Error("Arquivo invalido para upload");
  }

  const optimized = await optimizeImageIfPossible(file);

  if (isSupabaseStorageEnabled()) {
    return saveToSupabaseStorage(file, optimized, options);
  }

  return saveToLocalStorage(file, optimized);
}

module.exports = {
  saveUploadedFile,
  getUploadDir,
  localToWebFileUrl,
  uploadUrlToAbsolutePath,
  normalizeIncomingFileUrl,
  toFileOpenUrl,
  deleteUploadedFileByUrl,
  resolveFileUrlForAccess,
  isSupabaseStorageEnabled,
  getStorageBucketName,
};
