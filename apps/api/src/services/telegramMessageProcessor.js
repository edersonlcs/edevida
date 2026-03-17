const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  analyzeTextNutrition,
  analyzeImageNutrition,
  transcribeAudioFile,
  formatNutritionReply,
} = require("./nutritionAiService");
const { getUserContext } = require("./userContextService");
const { saveAiInteraction, saveHydrationLog, saveNutritionEntry } = require("./nutritionEntryService");
const { downloadFileBuffer } = require("../integrations/telegramClient");

function getLargestPhoto(photoList) {
  if (!Array.isArray(photoList) || photoList.length === 0) return null;

  return photoList.reduce((current, item) => {
    const currentSize = current?.file_size || 0;
    const nextSize = item?.file_size || 0;
    return nextSize > currentSize ? item : current;
  });
}

function inferExtension(filePathValue, contentType) {
  const fromPath = path.extname(filePathValue || "").toLowerCase();
  if (fromPath) return fromPath;

  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("ogg")) return ".ogg";
  if (normalizedType.includes("mpeg")) return ".mp3";
  if (normalizedType.includes("mp4")) return ".mp4";
  if (normalizedType.includes("wav")) return ".wav";
  if (normalizedType.includes("webm")) return ".webm";
  return ".bin";
}

function sanitizeWaterIntakePerMessage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed > 1500) return 0;
  return Math.round(parsed);
}

function hasExplicitWaterAmount(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;

  const hasWaterWord = value.includes("agua") || value.includes("água");
  const hasAmount = /\b\d+(?:[.,]\d+)?\s?(ml|l|litro|litros)\b/.test(value);
  return hasWaterWord && hasAmount;
}

async function ensureRuntimeTempDir() {
  const runtimeDir = path.resolve(__dirname, "../../../../temp/runtime");
  await fs.mkdir(runtimeDir, { recursive: true });
  return runtimeDir;
}

async function persistAnalysis({
  appUser,
  source,
  inputType,
  modality,
  rawInputText,
  parsed,
  modelUsed,
  rawResponse,
  extraAiPayload,
}) {
  const mergedAiPayload = {
    ...parsed,
    ...(extraAiPayload || {}),
  };

  await saveNutritionEntry({
    user_id: appUser.id,
    input_type: inputType,
    source,
    raw_input_text: rawInputText,
    analyzed_summary: parsed.summary,
    meal_quality: parsed.quality,
    recommended_action: parsed.action_now,
    estimated_calories: parsed.estimated_calories,
    estimated_protein_g: parsed.protein_g,
    estimated_carbs_g: parsed.carbs_g,
    estimated_fat_g: parsed.fat_g,
    water_ml_recommended: parsed.water_recommended_ml,
    ai_payload: mergedAiPayload,
  });

  await saveAiInteraction({
    user_id: appUser.id,
    modality,
    model_used: modelUsed,
    input_excerpt: String(rawInputText || "").slice(0, 3000),
    response_text: rawResponse,
    response_json: mergedAiPayload,
  });

  let safeWaterIntakeMl = sanitizeWaterIntakePerMessage(parsed.water_intake_ml);
  if ((inputType === "text" || inputType === "audio") && !hasExplicitWaterAmount(rawInputText)) {
    safeWaterIntakeMl = 0;
  }
  if (safeWaterIntakeMl > 0) {
    await saveHydrationLog({
      user_id: appUser.id,
      amount_ml: safeWaterIntakeMl,
      source,
      notes: `Registro automatico extraido de mensagem ${inputType}`,
    });
  }

  return {
    analysis: parsed,
    replyText: formatNutritionReply(parsed),
  };
}

async function processTextMessage({ appUser, messageText, source = "telegram" }) {
  const userContext = await getUserContext(appUser.id);
  const { parsed, modelUsed, rawResponse } = await analyzeTextNutrition(messageText, userContext);

  return persistAnalysis({
    appUser,
    source,
    inputType: "text",
    modality: "text",
    rawInputText: messageText,
    parsed,
    modelUsed,
    rawResponse,
  });
}

async function processPhotoMessage({ appUser, message, source = "telegram" }) {
  const selectedPhoto = getLargestPhoto(message.photo || []);
  if (!selectedPhoto?.file_id) {
    throw new Error("Foto nao encontrada na mensagem");
  }

  const userContext = await getUserContext(appUser.id);
  const downloaded = await downloadFileBuffer(selectedPhoto.file_id);

  const { parsed, modelUsed, rawResponse } = await analyzeImageNutrition({
    imageBuffer: downloaded.buffer,
    mimeType: downloaded.contentType,
    caption: message.caption || "",
    userContext,
  });

  const rawInputText = message.caption || "[foto sem legenda]";

  return persistAnalysis({
    appUser,
    source,
    inputType: "photo",
    modality: "vision",
    rawInputText,
    parsed,
    modelUsed,
    rawResponse,
    extraAiPayload: {
      telegram_file_path: downloaded.filePath,
      telegram_content_type: downloaded.contentType,
    },
  });
}

async function processAudioMessage({ appUser, message, source = "telegram" }) {
  const fileInfo = message.voice || message.audio;
  if (!fileInfo?.file_id) {
    throw new Error("Audio nao encontrado na mensagem");
  }

  const runtimeTempDir = await ensureRuntimeTempDir();
  const downloaded = await downloadFileBuffer(fileInfo.file_id);
  const extension = inferExtension(downloaded.filePath, downloaded.contentType);
  const tempFilePath = path.join(runtimeTempDir, `${randomUUID()}${extension}`);

  await fs.writeFile(tempFilePath, downloaded.buffer);

  try {
    const userContext = await getUserContext(appUser.id);
    const transcription = await transcribeAudioFile({ filePath: tempFilePath });
    const { parsed, modelUsed, rawResponse } = await analyzeTextNutrition(
      transcription.transcriptText,
      userContext
    );

    return persistAnalysis({
      appUser,
      source,
      inputType: "audio",
      modality: "audio",
      rawInputText: transcription.transcriptText,
      parsed,
      modelUsed: `${transcription.modelUsed}+${modelUsed}`,
      rawResponse,
      extraAiPayload: {
        transcript_text: transcription.transcriptText,
        telegram_file_path: downloaded.filePath,
        telegram_content_type: downloaded.contentType,
      },
    });
  } finally {
    await fs.unlink(tempFilePath).catch(() => {});
  }
}

module.exports = {
  processTextMessage,
  processPhotoMessage,
  processAudioMessage,
};
