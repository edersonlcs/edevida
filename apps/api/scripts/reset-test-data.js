#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { cfg } = require("../src/config/env");
const { supabase } = require("../src/integrations/supabaseClient");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipFiles = args.has("--skip-files");
const keepProfile = args.has("--keep-profile");
const keepGoals = args.has("--keep-goals");
const keepTelegramUpdates = args.has("--keep-telegram-updates");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function countByUser(tableName, userId) {
  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Falha ao contar em ${tableName}: ${error.message}`);
  }

  return Number(count || 0);
}

async function deleteByUser(tableName, userId) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Falha ao limpar ${tableName}: ${error.message}`);
  }
}

async function countTelegramUpdates() {
  const { count, error } = await supabase
    .from("telegram_updates")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Falha ao contar telegram_updates: ${error.message}`);
  }

  return Number(count || 0);
}

async function clearTelegramUpdates() {
  const { error } = await supabase
    .from("telegram_updates")
    .delete()
    .gt("update_id", -1);

  if (error) {
    throw new Error(`Falha ao limpar telegram_updates: ${error.message}`);
  }
}

async function removePath(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function cleanTempFiles() {
  const tempRoot = path.resolve(__dirname, "../../../temp");
  const uploadsDir = path.join(tempRoot, "uploads");
  const runtimeDir = path.join(tempRoot, "runtime");

  await fs.mkdir(tempRoot, { recursive: true });

  await removePath(uploadsDir);
  await removePath(runtimeDir);

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });

  const entries = await fs.readdir(tempRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".gitkeep" || entry.name === "uploads" || entry.name === "runtime") continue;
    await removePath(path.join(tempRoot, entry.name));
  }
}

async function main() {
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar preenchidos no .env");
  }

  const dataTables = [
    "daily_reports",
    "ai_interactions",
    "workout_sessions",
    "hydration_logs",
    "nutrition_entries",
    "medical_exams",
    "bioimpedance_records",
    "body_measurements",
    ...(keepGoals ? [] : ["user_goals"]),
    ...(keepProfile ? [] : ["user_profiles"]),
  ];

  const { data: users, error: usersError } = await supabase
    .from("app_users")
    .select("id, display_name, telegram_username")
    .order("created_at", { ascending: true });

  if (usersError) {
    throw new Error(`Falha ao listar app_users: ${usersError.message}`);
  }

  const safeUsers = users || [];
  log(`Usuarios encontrados: ${safeUsers.length}`);
  if (!safeUsers.length) {
    log("Nenhum usuario encontrado. Seguindo para limpeza de arquivos locais.");
  }

  for (const user of safeUsers) {
    log("");
    log(`Usuario: ${user.display_name || "-"} (${user.id})`);
    if (user.telegram_username) {
      log(`Telegram: @${user.telegram_username}`);
    }

    for (const tableName of dataTables) {
      const total = await countByUser(tableName, user.id);
      log(`- ${tableName}: ${total} registro(s)`);
      if (!dryRun && total > 0) {
        await deleteByUser(tableName, user.id);
      }
    }
  }

  const updatesCount = await countTelegramUpdates();
  log("");
  log(`telegram_updates: ${updatesCount} registro(s)`);
  if (!dryRun && !keepTelegramUpdates && updatesCount > 0) {
    await clearTelegramUpdates();
    log("- telegram_updates limpo");
  } else if (keepTelegramUpdates) {
    log("- telegram_updates mantido por flag --keep-telegram-updates");
  }

  if (skipFiles) {
    log("");
    log("Arquivos locais em temp/ foram mantidos por flag --skip-files.");
  } else {
    log("");
    if (dryRun) {
      log("Dry run: temp/ nao foi alterado.");
    } else {
      await cleanTempFiles();
      log("temp/ limpo (uploads, runtime e arquivos soltos).");
    }
  }

  log("");
  if (dryRun) {
    log("Dry run finalizado. Nenhum dado foi removido.");
  } else {
    log("Reset concluido com sucesso.");
  }
}

main().catch((err) => {
  fail(`Erro no reset: ${err.message}`);
  process.exit(1);
});
