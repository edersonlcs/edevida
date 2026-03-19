const path = require("path");
const dotenv = require("dotenv");

const envPath = process.env.ENV_FILE || path.resolve(__dirname, "../../../../.env");
dotenv.config({ path: envPath });

const cfg = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  appHost: process.env.APP_HOST || "127.0.0.1",
  appTimezone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  appBaseUrl: process.env.APP_BASE_URL || "https://edevida.edexterno.com.br",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModelText: process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini",
  openaiModelChat: process.env.OPENAI_MODEL_CHAT || "gpt-4o-mini",
  openaiModelVision: process.env.OPENAI_MODEL_VISION || "gpt-4.1-mini",
  openaiModelExamText: process.env.OPENAI_MODEL_EXAM_TEXT || "gpt-4.1",
  openaiModelExamVision: process.env.OPENAI_MODEL_EXAM_VISION || "gpt-4.1",
  openaiModelTranscribe: process.env.OPENAI_MODEL_TRANSCRIBE || "gpt-4o-mini-transcribe",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseDbUrl: process.env.SUPABASE_DB_URL || "",
  supabaseStorageEnabled: String(process.env.SUPABASE_STORAGE_ENABLED || "true").toLowerCase() !== "false",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "edevida-private",
  supabaseStorageSignedUrlTtlSeconds: Number(process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS || 900),
};

function missingRequiredForRuntime() {
  const required = [
    "telegramBotToken",
    "openaiApiKey",
    "supabaseUrl",
    "supabaseServiceRoleKey",
  ];

  return required.filter((key) => !cfg[key]);
}

module.exports = {
  cfg,
  missingRequiredForRuntime,
};
