const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { supabase } = require('../integrations/supabaseClient');
const { cfg } = require('../config/env');
const { isSupabaseStorageEnabled, getStorageBucketName } = require('./attachmentStorageService');

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const UPLOADS_DIR = path.join(PROJECT_ROOT, 'temp', 'uploads');
const DB_LIMIT_MB = Number(process.env.SUPABASE_DB_LIMIT_MB || 500);
const STORAGE_LIMIT_MB = Number(process.env.SUPABASE_STORAGE_LIMIT_MB || 1024);
const CACHE_TTL_MS = 60 * 1000;

const cache = new Map();

function toIntOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

async function dirSizeViaDuBytes(dirPath) {
  try {
    const { stdout } = await execFileAsync('du', ['-sb', dirPath]);
    const token = String(stdout || '').trim().split(/\s+/)[0];
    const bytes = Number(token);
    if (Number.isFinite(bytes) && bytes >= 0) {
      return bytes;
    }
  } catch {
    // fallback below
  }

  async function walk(target) {
    let total = 0;
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        total += await walk(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  }

  try {
    return await walk(dirPath);
  } catch {
    return 0;
  }
}

async function listFilesCount(dirPath) {
  let total = 0;

  async function walk(target) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        total += 1;
      }
    }
  }

  try {
    await walk(dirPath);
    return total;
  } catch {
    return 0;
  }
}

async function getDbSizeBytes() {
  if (!cfg.supabaseDbUrl) {
    return { sizeBytes: null, error: 'SUPABASE_DB_URL nao configurada' };
  }

  try {
    const { stdout } = await execFileAsync('psql', [
      cfg.supabaseDbUrl,
      '-At',
      '-c',
      'select pg_database_size(current_database());',
    ]);

    const bytes = Number(String(stdout || '').trim());
    if (!Number.isFinite(bytes) || bytes < 0) {
      return { sizeBytes: null, error: 'Nao foi possivel parsear o tamanho do banco' };
    }

    return { sizeBytes: bytes, error: null };
  } catch (err) {
    return {
      sizeBytes: null,
      error: String(err?.message || 'Falha ao consultar tamanho do banco'),
    };
  }
}

async function getStorageSummary() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    return {
      bucketsCount: null,
      buckets: [],
      error: error.message,
    };
  }

  const buckets = (data || []).map((item) => ({
    id: item.id,
    name: item.name,
    public: Boolean(item.public),
  }));

  return {
    bucketsCount: buckets.length,
    buckets,
    error: null,
  };
}

async function countTable(table, userId = null) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (userId && table !== 'telegram_updates') {
    query = query.eq('user_id', userId);
  }

  const { count, error } = await query;
  if (error) {
    return { value: null, error: error.message };
  }

  return { value: count ?? 0, error: null };
}

async function getUserName(userId) {
  const { data, error } = await supabase
    .from('app_users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) return 'Usuario';
  return data?.display_name || 'Usuario';
}

function withPct(sizeBytes, limitMb) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  const limitBytes = Number(limitMb) * 1024 * 1024;
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) return null;
  return Number(((sizeBytes / limitBytes) * 100).toFixed(2));
}

async function computeSystemUsage(userId) {
  const [projectBytes, uploadsBytes, uploadsFiles, dbInfo, storage, userName] = await Promise.all([
    dirSizeViaDuBytes(PROJECT_ROOT),
    dirSizeViaDuBytes(UPLOADS_DIR),
    listFilesCount(UPLOADS_DIR),
    getDbSizeBytes(),
    getStorageSummary(),
    getUserName(userId),
  ]);

  const tables = {
    perfil: await countTable('user_profiles', userId),
    medidas_corporais: await countTable('body_measurements', userId),
    bioimpedancia: await countTable('bioimpedance_records', userId),
    exames: await countTable('medical_exams', userId),
    alimentacao: await countTable('nutrition_entries', userId),
    hidratacao: await countTable('hydration_logs', userId),
    treinos: await countTable('workout_sessions', userId),
    interacoes_ia: await countTable('ai_interactions', userId),
    updates_telegram: await countTable('telegram_updates', null),
  };

  return {
    generated_at: new Date().toISOString(),
    project_local: {
      path: PROJECT_ROOT,
      size_bytes: toIntOrZero(projectBytes),
    },
    uploads_local: {
      path: UPLOADS_DIR,
      size_bytes: toIntOrZero(uploadsBytes),
      files_count: toIntOrZero(uploadsFiles),
    },
    supabase: {
      database: {
        size_bytes: dbInfo.sizeBytes,
        limit_mb: DB_LIMIT_MB,
        usage_pct: withPct(dbInfo.sizeBytes, DB_LIMIT_MB),
        error: dbInfo.error,
      },
      storage: {
        enabled: isSupabaseStorageEnabled(),
        bucket: getStorageBucketName(),
        buckets_count: storage.bucketsCount,
        buckets: storage.buckets,
        limit_mb: STORAGE_LIMIT_MB,
        error: storage.error,
      },
    },
    user: {
      id: userId,
      display_name: userName,
      counts: {
        perfil: tables.perfil.value,
        medidas_corporais: tables.medidas_corporais.value,
        bioimpedancia: tables.bioimpedancia.value,
        exames: tables.exames.value,
        alimentacao: tables.alimentacao.value,
        hidratacao: tables.hidratacao.value,
        treinos: tables.treinos.value,
        interacoes_ia: tables.interacoes_ia.value,
        updates_telegram: tables.updates_telegram.value,
      },
      errors: Object.fromEntries(
        Object.entries(tables)
          .filter(([, item]) => item.error)
          .map(([key, item]) => [key, item.error])
      ),
    },
  };
}

async function getSystemUsageSnapshot({ userId, force = false } = {}) {
  const key = String(userId || 'default');
  const now = Date.now();
  const cached = cache.get(key);

  if (!force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const snapshot = await computeSystemUsage(userId);
  cache.set(key, {
    value: snapshot,
    expiresAt: now + CACHE_TTL_MS,
  });

  return snapshot;
}

module.exports = {
  getSystemUsageSnapshot,
};
