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
  openaiModelText: process.env.OPENAI_MODEL_TEXT || "gpt-5-mini",
  openaiModelVision: process.env.OPENAI_MODEL_VISION || "gpt-5-mini",
  openaiModelTranscribe: process.env.OPENAI_MODEL_TRANSCRIBE || "gpt-4o-mini-transcribe",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseDbUrl: process.env.SUPABASE_DB_URL || "",
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
