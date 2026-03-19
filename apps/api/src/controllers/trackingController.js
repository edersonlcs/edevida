const { asyncHandler } = require("../utils/asyncHandler");
const {
  resolveUserId,
  listUsers,
  createDefaultUserIfNeeded,
  findOrCreateUserFromAuth,
} = require("../services/userService");
const {
  processTextMessage,
  processImageBufferInput,
  processAudioBufferInput,
} = require("../services/telegramMessageProcessor");
const {
  saveAiInteraction,
  saveHydrationLog,
  saveNutritionEntry,
} = require("../services/nutritionEntryService");
const { getUserContext } = require("../services/userContextService");
const {
  chatNutritionAdvisor,
  formatNutritionReply,
  reviseNutritionDraft,
} = require("../services/nutritionAiService");
const {
  upsertUserProfile,
  getUserProfile,
  createGoal,
  listGoals,
  createBodyMeasurement,
  listBodyMeasurements,
  getBodyMeasurementById,
  deleteBodyMeasurement,
  createBioimpedanceRecord,
  listBioimpedanceRecords,
  getBioimpedanceRecordById,
  deleteBioimpedanceRecord,
  createMedicalExam,
  listMedicalExams,
  getMedicalExamById,
  updateMedicalExam,
  deleteMedicalExam,
  createHydrationLog,
  listHydrationLogs,
  createWorkoutSession,
  listWorkoutSessions,
  listNutritionEntries,
  getNutritionEntryById,
  updateNutritionEntry,
  getUserAiSettings,
  saveUserAiSettings,
} = require("../services/trackingDataService");
const {
  saveUploadedFile,
  normalizeIncomingFileUrl,
  toFileOpenUrl,
  deleteUploadedFileByUrl,
  resolveFileUrlForAccess,
} = require("../services/attachmentStorageService");
const { generateAndStoreReport, listReports } = require("../services/reportService");
const { getDashboardOverview } = require("../services/dashboardService");
const { getWorkoutRecommendation } = require("../services/workoutPlannerService");
const {
  analyzeBioimpedanceImage,
  analyzeMedicalExamText,
  analyzeMedicalExamImage,
  extractPdfTextFromBuffer,
  markersArrayToObject,
  isPdfMime,
  isImageMime,
} = require("../services/healthAttachmentAiService");
const { cfg } = require("../config/env");
const { getPersonaDocument } = require("../services/personaService");
const { getSystemUsageSnapshot } = require("../services/systemUsageService");
const {
  MODEL_LABELS,
  resolveAiSettingsFromProfile,
  buildAiSettingsForStorage,
  listAiProfiles,
} = require("../services/aiModelConfigService");

function toLimit(value, fallback = 30, max = 200) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeStoredFileUrlForResponse(fileUrl) {
  const normalized = normalizeIncomingFileUrl(fileUrl);
  return toFileOpenUrl(normalized);
}

function normalizeStoredFileUrlForStorage(fileUrl) {
  return normalizeIncomingFileUrl(fileUrl);
}

function extractUploadUrlFromNotes(notes) {
  const raw = String(notes || "");
  const markerMatch = raw.match(/\[file_ref:([^\]]+)\]/i);
  if (markerMatch?.[1]) {
    return normalizeStoredFileUrlForStorage(markerMatch[1]);
  }

  const match = raw.match(/(supabase:\/\/[^\s|]+|local:\/\/temp\/uploads\/[^\s|]+|\/uploads\/[^\s|]+)/i);
  return normalizeStoredFileUrlForStorage(match ? match[1] : "");
}

function withFileRefMarker(notes, fileUrl) {
  const cleanNotes = String(notes || "")
    .replace(/\s*\[file_ref:[^\]]+\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const canonical = normalizeStoredFileUrlForStorage(fileUrl);
  if (!canonical) return cleanNotes;
  if (!cleanNotes) return `[file_ref:${canonical}]`;
  return `${cleanNotes} [file_ref:${canonical}]`;
}

function stripFileRefMarker(notes) {
  return String(notes || "")
    .replace(/\s*\[file_ref:[^\]]+\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecordedAt(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) {
    return `${raw.replace(" ", "T")}:00-03:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T12:00:00-03:00`;
  }

  return raw;
}

function normalizeDateFilter(value, mode = "from") {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return mode === "to" ? `${raw}T23:59:59-03:00` : `${raw}T00:00:00-03:00`;
  }

  return raw;
}

function parsePersistFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  return fallback;
}

function sanitizeWaterIntakePerMessage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed > 1500) return 0;
  return Math.round(parsed);
}

const PT_NUMBER_WORDS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
};

function parsePtNumericToken(rawToken) {
  const token = String(rawToken || "")
    .trim()
    .toLowerCase();

  if (!token) return null;

  const numeric = Number(token.replace(",", "."));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  return PT_NUMBER_WORDS[token] || null;
}

function extractWaterAmountMlFromText(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return 0;

  const hasWaterWord = value.includes("agua") || value.includes("água");
  if (!hasWaterWord) return 0;

  const explicitMatch = value.match(/\b(\d+(?:[.,]\d+)?)\s?(ml|l|litro|litros)\b/);
  if (explicitMatch) {
    const amount = Number(explicitMatch[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const unit = explicitMatch[2];
    if (unit === "ml") return Math.round(amount);
    return Math.round(amount * 1000);
  }

  const cupMatch = value.match(/\b([\p{L}\d.,]+)\s+(copo|copos|xicara|xicaras|xícara|xícaras)\b/u);
  if (cupMatch) {
    const qty = parsePtNumericToken(cupMatch[1]);
    if (!qty || !Number.isFinite(qty)) return 0;
    return Math.round(qty * 250);
  }

  return 0;
}

function hasExplicitWaterAmount(text) {
  return extractWaterAmountMlFromText(text) > 0;
}

function normalizeSimpleText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isPureWaterFoodName(name) {
  const normalized = normalizeSimpleText(name).replace(/\s+/g, " ");
  return ["agua", "agua mineral", "water"].includes(normalized);
}

function isWaterOnlyAnalysis(rawInputText, normalizedAnalysis) {
  const waterMlFromText = extractWaterAmountMlFromText(rawInputText);
  if (waterMlFromText <= 0) return false;

  const calories = Number(normalizedAnalysis?.estimated_calories || 0);
  const foodItems = Array.isArray(normalizedAnalysis?.food_items) ? normalizedAnalysis.food_items : [];
  const hasNonWaterItem = foodItems.some((item) => {
    const name = normalizeSimpleText(item?.food_name || "");
    if (!name) return false;
    return !isPureWaterFoodName(name);
  });

  const waterFromAnalysis = Number(normalizedAnalysis?.water_intake_ml || 0);
  const effectiveWater = Math.max(waterMlFromText, Number.isFinite(waterFromAnalysis) ? waterFromAnalysis : 0);
  if (!effectiveWater) return false;

  return calories <= 80 && !hasNonWaterItem;
}

function normalizeInputType(value) {
  const normalized = String(value || "").toLowerCase();
  if (["text", "photo", "audio", "manual"].includes(normalized)) return normalized;
  return "manual";
}

function normalizeSource(value) {
  const normalized = String(value || "").toLowerCase();
  if (["telegram", "web", "system"].includes(normalized)) return normalized;
  return "web";
}

function mapInputTypeToModality(inputType) {
  const normalized = normalizeInputType(inputType);
  if (normalized === "photo") return "vision";
  if (normalized === "audio") return "audio";
  return "text";
}

const MEAL_SLOT_VALUES = [
  "cafe_da_manha",
  "lanche_da_manha",
  "almoco",
  "lanche_da_tarde",
  "janta",
  "ceia",
  "outro",
];

const FOOD_QUALITY_VALUES = ["otimo", "bom", "ainda pode, mas pouco", "ruim", "nunca coma"];

function normalizeMealSlot(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (MEAL_SLOT_VALUES.includes(normalized)) return normalized;
  return "outro";
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toIntegerOrNull(value) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  return Math.round(parsed);
}

function normalizeDraftAnalysis(input) {
  const base = input && typeof input === "object" ? input : {};
  const qualityValue = String(base.quality || "").toLowerCase().trim();
  const foodItems = Array.isArray(base.food_items)
    ? base.food_items
        .map((item) => ({
          food_name: String(item?.food_name || "item").slice(0, 180),
          portion: String(item?.portion || "porcao nao informada").slice(0, 180),
          quality: String(item?.quality || "bom").toLowerCase().trim(),
          reason: String(item?.reason || "sem observacao").slice(0, 500),
          estimated_calories: toNumberOrNull(item?.estimated_calories),
          protein_g: toNumberOrNull(item?.protein_g),
          carbs_g: toNumberOrNull(item?.carbs_g),
          fat_g: toNumberOrNull(item?.fat_g),
          fat_good_g: toNumberOrNull(item?.fat_good_g),
          fat_bad_g: toNumberOrNull(item?.fat_bad_g),
          sodium_mg: toNumberOrNull(item?.sodium_mg),
          sugar_g: toNumberOrNull(item?.sugar_g),
        }))
        .slice(0, 30)
    : [];

  return {
    meal_slot: normalizeMealSlot(base.meal_slot),
    summary: String(base.summary || "").trim() || null,
    quality: FOOD_QUALITY_VALUES.includes(qualityValue) ? qualityValue : null,
    impact: String(base.impact || "").trim() || null,
    action_now: String(base.action_now || "").trim() || null,
    next_step: String(base.next_step || "").trim() || null,
    hydration_tip: String(base.hydration_tip || "").trim() || null,
    water_intake_ml: toIntegerOrNull(base.water_intake_ml),
    water_recommended_ml: toIntegerOrNull(base.water_recommended_ml),
    estimated_calories: toNumberOrNull(base.estimated_calories),
    protein_g: toNumberOrNull(base.protein_g),
    carbs_g: toNumberOrNull(base.carbs_g),
    fat_g: toNumberOrNull(base.fat_g),
    fat_good_g: toNumberOrNull(base.fat_good_g),
    fat_bad_g: toNumberOrNull(base.fat_bad_g),
    sodium_mg: toNumberOrNull(base.sodium_mg),
    sugar_g: toNumberOrNull(base.sugar_g),
    food_items: foodItems,
  };
}

async function persistNutritionFromAnalysis({
  userId,
  analysis,
  rawInputText,
  inputType,
  source,
  recordedAt,
  modelUsed,
  rawResponse,
  extraAiPayload,
}) {
  const normalizedAnalysis = normalizeDraftAnalysis(analysis);
  const waterOnly = isWaterOnlyAnalysis(rawInputText, normalizedAnalysis);
  const mergedAiPayload = {
    ...normalizedAnalysis,
    water_only: waterOnly,
    ...(extraAiPayload && typeof extraAiPayload === "object" ? extraAiPayload : {}),
  };
  let nutrition = null;
  if (!waterOnly) {
    nutrition = await saveNutritionEntry({
      user_id: userId,
      input_type: normalizeInputType(inputType),
      source: normalizeSource(source),
      raw_input_text: rawInputText || "[registro web sem texto]",
      analyzed_summary: normalizedAnalysis.summary || null,
      meal_quality: normalizedAnalysis.quality || null,
      recommended_action: normalizedAnalysis.action_now || null,
      estimated_calories: normalizedAnalysis.estimated_calories ?? null,
      estimated_protein_g: normalizedAnalysis.protein_g ?? null,
      estimated_carbs_g: normalizedAnalysis.carbs_g ?? null,
      estimated_fat_g: normalizedAnalysis.fat_g ?? null,
      water_ml_recommended: normalizedAnalysis.water_recommended_ml ?? null,
      recorded_at: recordedAt || undefined,
      ai_payload: mergedAiPayload,
    });
  }

  await saveAiInteraction({
    user_id: userId,
    modality: mapInputTypeToModality(inputType),
    model_used: modelUsed || "web_draft",
    input_excerpt: String(rawInputText || "[registro web sem texto]").slice(0, 3000),
    response_text: String(rawResponse || ""),
    response_json: mergedAiPayload,
  }).catch(() => {});

  let safeWaterIntakeMl = sanitizeWaterIntakePerMessage(normalizedAnalysis.water_intake_ml);
  if (inputType === "text" || inputType === "audio") {
    const parsedWaterMl = extractWaterAmountMlFromText(rawInputText);
    if (parsedWaterMl > 0) {
      safeWaterIntakeMl = sanitizeWaterIntakePerMessage(parsedWaterMl);
    } else if (!hasExplicitWaterAmount(rawInputText)) {
      safeWaterIntakeMl = 0;
    }
  }

  if (safeWaterIntakeMl > 0) {
    await saveHydrationLog({
      user_id: userId,
      amount_ml: safeWaterIntakeMl,
      source: normalizeSource(source),
      notes: `Registro automatico extraido de rascunho ${normalizeInputType(inputType)}`,
      recorded_at: recordedAt || undefined,
    }).catch(() => {});
  }

  return {
    nutrition,
    nutritionSaved: Boolean(nutrition),
    waterOnly,
    waterLoggedMl: safeWaterIntakeMl,
  };
}

async function resolveRequestUserId(req) {
  return resolveUserId(req.body?.user_id || req.query?.user_id, req.auth?.appUser?.id || null);
}

const authConfigController = asyncHandler(async (_req, res) => {
  return res.json({
    ok: true,
    auth: {
      enabled: Boolean(cfg.webAuthEnabled),
      supabase_url: cfg.supabaseUrl,
      supabase_publishable_key: cfg.supabasePublishableKey,
      session_max_hours: Number.isFinite(cfg.webAuthSessionMaxHours)
        ? Math.max(1, cfg.webAuthSessionMaxHours)
        : 12,
    },
  });
});

const authMeController = asyncHandler(async (req, res) => {
  if (!req.auth?.supabaseUser) {
    return res.status(401).json({ ok: false, error: "Sessao nao autenticada" });
  }

  const appUser = req.auth?.appUser || (await findOrCreateUserFromAuth(req.auth.supabaseUser));
  return res.json({
    ok: true,
    auth_user: {
      id: req.auth.supabaseUser.id,
      email: req.auth.supabaseUser.email || null,
      created_at: req.auth.supabaseUser.created_at || null,
    },
    app_user: appUser,
  });
});

const usersListController = asyncHandler(async (req, res) => {
  const autoCreate = String(req.query.auto_create || "").toLowerCase();
  let users = await listUsers();

  if (users.length === 0 && (autoCreate === "1" || autoCreate === "true")) {
    await createDefaultUserIfNeeded();
    users = await listUsers();
  }

  return res.json({ ok: true, users });
});

const userProfileUpsertController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const profile = await upsertUserProfile({
    userId,
    ...req.body,
  });

  return res.json({ ok: true, profile });
});

const userProfileGetController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const profile = await getUserProfile(userId);
  return res.json({ ok: true, profile });
});

const userGoalCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const { goal_type } = req.body;

  if (!goal_type) {
    return res.status(400).json({ ok: false, error: "goal_type obrigatorio" });
  }

  const goal = await createGoal({ userId, ...req.body });
  return res.status(201).json({ ok: true, goal });
});

const userGoalListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const goals = await listGoals(userId);
  return res.json({ ok: true, goals });
});

const bodyMeasurementCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const measurement = await createBodyMeasurement({
    userId,
    ...req.body,
    progress_photo_url: normalizeStoredFileUrlForStorage(req.body.progress_photo_url),
  });
  return res.status(201).json({
    ok: true,
    measurement: {
      ...measurement,
      progress_photo_url: normalizeStoredFileUrlForResponse(measurement.progress_photo_url),
    },
  });
});

const bodyMeasurementProgressPhotoUploadController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ ok: false, error: "Arquivo obrigatorio (campo file)" });
  }

  if (!String(file.mimetype || "").startsWith("image/")) {
    return res.status(400).json({ ok: false, error: "Envie uma imagem valida (jpg/png/webp)." });
  }

  const storedFile = await saveUploadedFile(file, { folder: "progress-photos" });
  const measurement = await createBodyMeasurement({
    userId,
    weight_kg: req.body.weight_kg,
    body_fat_pct: req.body.body_fat_pct,
    chest_cm: req.body.chest_cm,
    waist_cm: req.body.waist_cm,
    abdomen_cm: req.body.abdomen_cm,
    hip_cm: req.body.hip_cm,
    arm_cm: req.body.arm_cm,
    thigh_cm: req.body.thigh_cm,
    calf_cm: req.body.calf_cm,
    progress_photo_url: storedFile.fileUrl,
    notes: withFileRefMarker(
      req.body.notes || "Foto de evolucao enviada via web.",
      storedFile.fileUrl
    ),
    recorded_at: normalizeRecordedAt(req.body.recorded_at),
  });

  return res.status(201).json({
    ok: true,
    measurement: {
      ...measurement,
      progress_photo_url: normalizeStoredFileUrlForResponse(measurement.progress_photo_url),
      notes: stripFileRefMarker(measurement.notes),
    },
    file: {
      url: storedFile.webFileUrl,
      canonicalUrl: storedFile.fileUrl,
      localUrl: storedFile.localFileUrl,
      webUrl: storedFile.webFileUrl,
      provider: storedFile.storageProvider,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
      originalSize: storedFile.originalSize,
      optimized: storedFile.optimized,
    },
  });
});

const bodyMeasurementListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const measurements = await listBodyMeasurements(userId, {
    from: normalizeDateFilter(req.query.from, "from"),
    to: normalizeDateFilter(req.query.to, "to"),
    limit: toLimit(req.query.limit, 30, 120),
  });
  const normalized = measurements.map((measurement) => ({
    ...measurement,
    progress_photo_url: normalizeStoredFileUrlForResponse(measurement.progress_photo_url),
    notes: stripFileRefMarker(measurement.notes),
  }));
  return res.json({ ok: true, measurements: normalized });
});

const bodyMeasurementDeleteController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const measurementId = String(req.params.id || "").trim();
  if (!measurementId) {
    return res.status(400).json({ ok: false, error: "id da medida corporal obrigatorio" });
  }

  const existing = await getBodyMeasurementById(userId, measurementId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "Medida corporal nao encontrada" });
  }

  const removed = await deleteBodyMeasurement(userId, measurementId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "Medida corporal nao encontrada para exclusao" });
  }

  const possibleUrls = [existing.progress_photo_url, extractUploadUrlFromNotes(existing.notes)]
    .map((value) => normalizeStoredFileUrlForStorage(value))
    .filter(Boolean);
  const uniqueUrls = [...new Set(possibleUrls)];
  const warnings = [];
  let deletedFiles = 0;

  for (const fileUrl of uniqueUrls) {
    try {
      const deleted = await deleteUploadedFileByUrl(fileUrl);
      if (deleted) deletedFiles += 1;
    } catch (err) {
      warnings.push(`Falha ao remover arquivo ${fileUrl}: ${err.message}`);
    }
  }

  return res.json({
    ok: true,
    measurement_id: measurementId,
    deleted_files: deletedFiles,
    warnings,
  });
});

const bioimpedanceCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const record = await createBioimpedanceRecord({ userId, ...req.body });
  return res.status(201).json({ ok: true, record });
});

const bioimpedanceListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const records = await listBioimpedanceRecords(userId, {
    from: normalizeDateFilter(req.query.from, "from"),
    to: normalizeDateFilter(req.query.to, "to"),
    limit: toLimit(req.query.limit, 30, 120),
  });
  const normalized = records.map((record) => {
    const fileRef = extractUploadUrlFromNotes(record.notes);
    return {
      ...record,
      attachment_url: normalizeStoredFileUrlForResponse(fileRef),
      notes: stripFileRefMarker(record.notes),
    };
  });
  return res.json({ ok: true, records: normalized });
});

const medicalExamCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  if (!req.body.exam_name) {
    return res.status(400).json({ ok: false, error: "exam_name obrigatorio" });
  }

  const exam = await createMedicalExam({
    userId,
    ...req.body,
    exam_date: normalizeRecordedAt(req.body.exam_date),
    file_url: normalizeStoredFileUrlForStorage(req.body.file_url),
  });

  return res.status(201).json({
    ok: true,
    exam: {
      ...exam,
      file_url: normalizeStoredFileUrlForResponse(exam.file_url),
    },
  });
});

function normalizeOpenAiError(err) {
  const message = String(err?.message || "").toLowerCase();
  if (message.includes("quota") || message.includes("insufficient_quota")) {
    return "OPENAI_QUOTA";
  }
  if (message.includes("rate limit")) {
    return "OPENAI_RATE_LIMIT";
  }
  return "OPENAI_UNAVAILABLE";
}

function normalizeOpenAiErrorDetail(err) {
  const reason = normalizeOpenAiError(err);

  const userMessageMap = {
    OPENAI_QUOTA:
      "OpenAI sem credito/quota no momento. O arquivo foi recebido, mas a analise IA nao foi concluida.",
    OPENAI_RATE_LIMIT:
      "OpenAI com limite temporario. O arquivo foi recebido e pode ser reprocessado em seguida.",
    OPENAI_UNAVAILABLE:
      "OpenAI indisponivel no momento. O arquivo foi recebido, mas sem analise automatica.",
  };

  return {
    reason,
    userMessage: userMessageMap[reason] || userMessageMap.OPENAI_UNAVAILABLE,
  };
}

const bioimpedanceUploadController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ ok: false, error: "Arquivo obrigatorio (campo file)" });
  }

  const storedFile = await saveUploadedFile(file, { folder: "bioimpedance" });
  const recordedAt = normalizeRecordedAt(req.body.recorded_at);

  if (!isImageMime(storedFile.mimeType, file.originalname)) {
    return res.status(400).json({
      ok: false,
      error: "Formato nao suportado para bioimpedancia. Envie imagem (jpg/png/webp).",
    });
  }

  try {
    const ai = await analyzeBioimpedanceImage({
      imageBuffer: file.buffer,
      mimeType: storedFile.mimeType,
    });

    const parsed = ai.parsed;
    const effectiveRecordedAt =
      recordedAt || normalizeRecordedAt(parsed.measured_at) || new Date().toISOString();

    const record = await createBioimpedanceRecord({
      userId,
      body_fat_pct: parsed.body_fat_pct,
      muscle_mass_kg: parsed.muscle_mass_kg,
      visceral_fat_level: parsed.visceral_fat_level,
      body_water_pct: parsed.body_water_pct,
      bmr_kcal: parsed.bmr_kcal,
      metabolic_age: parsed.metabolic_age,
      lean_mass_kg: parsed.fat_free_mass_kg,
      recorded_at: effectiveRecordedAt,
      notes: withFileRefMarker(
        [
          "Fonte arquivo: anexo recebido",
          `Resumo IA: ${parsed.source_summary}`,
          `IMC: ${parsed.bmi ?? "n/d"} | WHR: ${parsed.whr ?? "n/d"}`,
          `Tipo corpo: ${parsed.body_type_text || "n/d"} | Nivel obesidade: ${parsed.obesity_level_text || "n/d"}`,
        ].join(" | "),
        storedFile.fileUrl
      ),
    });

    let bodyMeasurement = null;
    if (parsed.weight_kg || parsed.body_fat_pct || parsed.bmi) {
      bodyMeasurement = await createBodyMeasurement({
        userId,
        weight_kg: parsed.weight_kg,
        body_fat_pct: parsed.body_fat_pct,
        progress_photo_url: storedFile.fileUrl,
        recorded_at: effectiveRecordedAt,
        notes: withFileRefMarker(
          "Registro automatico via anexo bioimpedancia.",
          storedFile.fileUrl
        ),
      });
    }

    await saveAiInteraction({
      user_id: userId,
      modality: "vision",
      model_used: ai.modelUsed,
      input_excerpt: `bioimpedance_upload:${storedFile.fileName}`,
      response_text: ai.rawResponse,
      response_json: parsed,
    }).catch(() => {});

    return res.status(201).json({
      ok: true,
      analyzed: true,
      record: {
        ...record,
        attachment_url: normalizeStoredFileUrlForResponse(storedFile.fileUrl),
        notes: stripFileRefMarker(record.notes),
      },
      body_measurement: bodyMeasurement
        ? {
            ...bodyMeasurement,
            progress_photo_url: normalizeStoredFileUrlForResponse(bodyMeasurement.progress_photo_url),
            notes: stripFileRefMarker(bodyMeasurement.notes),
          }
        : null,
      parsed,
      file: {
        url: storedFile.webFileUrl,
        canonicalUrl: storedFile.fileUrl,
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
        provider: storedFile.storageProvider,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        originalSize: storedFile.originalSize,
        optimized: storedFile.optimized,
      },
    });
  } catch (err) {
    const info = normalizeOpenAiErrorDetail(err);

    await saveAiInteraction({
      user_id: userId,
      modality: "vision",
      model_used: info.reason,
      input_excerpt: `bioimpedance_upload:${storedFile.fileName}`,
      response_text: err.message,
      response_json: { error: err.message, reason: info.reason },
    }).catch(() => {});

    return res.status(503).json({
      ok: false,
      analyzed: false,
      reason: info.reason,
      message: info.userMessage,
      file: {
        url: storedFile.webFileUrl,
        canonicalUrl: storedFile.fileUrl,
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
        provider: storedFile.storageProvider,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        originalSize: storedFile.originalSize,
        optimized: storedFile.optimized,
      },
    });
  }
});

const medicalExamUploadController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ ok: false, error: "Arquivo obrigatorio (campo file)" });
  }

  const storedFile = await saveUploadedFile(file, { folder: "medical-exams" });
  const baseExamName = req.body.exam_name || "Exame anexado";
  const baseExamType = req.body.exam_type || "anexo";
  const baseExamDate = normalizeRecordedAt(req.body.exam_date);
  const userProfile = await getUserProfile(userId);
  const aiSettings = resolveAiSettingsFromProfile(userProfile || null);
  const examUploadTextModel = aiSettings?.models?.exam_upload_text || cfg.openaiModelExamText;
  const examUploadVisionModel = aiSettings?.models?.exam_upload_vision || cfg.openaiModelExamVision;

  try {
    let ai = null;

    if (isPdfMime(storedFile.mimeType, file.originalname)) {
      const extractedText = await extractPdfTextFromBuffer(file.buffer);
      ai = await analyzeMedicalExamText({
        rawText: extractedText,
        modelOverride: examUploadTextModel,
      });
    } else if (isImageMime(storedFile.mimeType, file.originalname)) {
      ai = await analyzeMedicalExamImage({
        imageBuffer: file.buffer,
        mimeType: storedFile.mimeType,
        modelOverride: examUploadVisionModel,
      });
    } else {
      const exam = await createMedicalExam({
        userId,
        exam_name: baseExamName,
        exam_type: baseExamType,
        exam_date: baseExamDate,
        markers: {},
        file_url: storedFile.fileUrl,
        notes: withFileRefMarker(
          "Arquivo salvo, formato nao suportado para analise IA automatica.",
          storedFile.fileUrl
        ),
      });

      return res.status(201).json({
        ok: true,
        analyzed: false,
        exam: {
          ...exam,
          file_url: normalizeStoredFileUrlForResponse(exam.file_url),
          notes: stripFileRefMarker(exam.notes),
        },
        warning: "Formato sem analise IA automatica. Use PDF ou imagem.",
      });
    }

    const parsed = ai.parsed;
    const markersObj = markersArrayToObject(parsed.markers);

    const exam = await createMedicalExam({
      userId,
      exam_name: parsed.exam_name || baseExamName,
      exam_type: parsed.exam_type || baseExamType,
      exam_date: normalizeRecordedAt(parsed.exam_date) || baseExamDate,
      markers: markersObj,
      file_url: storedFile.fileUrl,
      notes: withFileRefMarker(
        [parsed.summary, ...(parsed.risk_flags || []).map((item) => `Risco: ${item}`)].join(" | "),
        storedFile.fileUrl
      ),
    });

    await saveAiInteraction({
      user_id: userId,
      modality: "vision",
      model_used: ai.modelUsed,
      input_excerpt: `medical_exam_upload:${storedFile.fileName}`,
      response_text: ai.rawResponse,
      response_json: parsed,
    }).catch(() => {});

    return res.status(201).json({
      ok: true,
      analyzed: true,
      exam: {
        ...exam,
        file_url: normalizeStoredFileUrlForResponse(exam.file_url),
        notes: stripFileRefMarker(exam.notes),
      },
      parsed,
      file: {
        url: storedFile.webFileUrl,
        canonicalUrl: storedFile.fileUrl,
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
        provider: storedFile.storageProvider,
        mimeType: storedFile.mimeType,
        size: storedFile.size,
        originalSize: storedFile.originalSize,
        optimized: storedFile.optimized,
      },
    });
  } catch (err) {
    const info = normalizeOpenAiErrorDetail(err);

    const fallbackExam = await createMedicalExam({
      userId,
      exam_name: baseExamName,
      exam_type: baseExamType,
      exam_date: baseExamDate,
      markers: {},
      file_url: storedFile.fileUrl,
      notes: withFileRefMarker(`Arquivo salvo sem analise IA. Motivo: ${err.message}`, storedFile.fileUrl),
    });

    await saveAiInteraction({
      user_id: userId,
      modality: "vision",
      model_used: info.reason,
      input_excerpt: `medical_exam_upload:${storedFile.fileName}`,
      response_text: err.message,
      response_json: { error: err.message, reason: info.reason },
    }).catch(() => {});

    return res.status(503).json({
      ok: false,
      analyzed: false,
      reason: info.reason,
      message: info.userMessage,
      exam: {
        ...fallbackExam,
        file_url: normalizeStoredFileUrlForResponse(fallbackExam.file_url),
        notes: stripFileRefMarker(fallbackExam.notes),
      },
    });
  }
});

const medicalExamListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const exams = await listMedicalExams(userId, {
    from: normalizeDateFilter(req.query.from, "from"),
    to: normalizeDateFilter(req.query.to, "to"),
    limit: toLimit(req.query.limit, 30, 120),
  });

  const normalized = exams.map((exam) => ({
    ...exam,
    file_url: normalizeStoredFileUrlForResponse(exam.file_url),
    notes: stripFileRefMarker(exam.notes),
  }));

  return res.json({ ok: true, exams: normalized });
});

const medicalExamUpdateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const examId = String(req.params.id || "").trim();
  if (!examId) {
    return res.status(400).json({ ok: false, error: "id do exame obrigatorio" });
  }

  const existing = await getMedicalExamById(userId, examId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "Exame nao encontrado" });
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "exam_name")) {
    const value = String(req.body.exam_name || "").trim();
    if (!value) {
      return res.status(400).json({ ok: false, error: "exam_name nao pode ficar vazio" });
    }
    patch.exam_name = value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "exam_type")) {
    patch.exam_type = String(req.body.exam_type || "").trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "exam_date")) {
    patch.exam_date = normalizeRecordedAt(req.body.exam_date) || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "notes")) {
    patch.notes = String(req.body.notes || "").trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "file_url")) {
    patch.file_url = normalizeStoredFileUrlForStorage(req.body.file_url);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "markers")) {
    patch.markers = safeObject(req.body.markers);
  }

  if (!Object.keys(patch).length) {
    return res.status(400).json({ ok: false, error: "Nenhum campo valido para atualizar" });
  }

  const exam = await updateMedicalExam(userId, examId, patch);
  if (!exam) {
    return res.status(404).json({ ok: false, error: "Exame nao encontrado para atualizacao" });
  }

  return res.json({
    ok: true,
    exam: {
      ...exam,
      file_url: normalizeStoredFileUrlForResponse(exam.file_url),
      notes: stripFileRefMarker(exam.notes),
    },
  });
});

const medicalExamDeleteController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const examId = String(req.params.id || "").trim();
  if (!examId) {
    return res.status(400).json({ ok: false, error: "id do exame obrigatorio" });
  }

  const existing = await getMedicalExamById(userId, examId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "Exame nao encontrado" });
  }

  const removed = await deleteMedicalExam(userId, examId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "Exame nao encontrado para remocao" });
  }

  let fileDeleted = false;
  if (existing.file_url) {
    try {
      fileDeleted = await deleteUploadedFileByUrl(existing.file_url);
    } catch {
      fileDeleted = false;
    }
  }

  return res.json({
    ok: true,
    deleted: true,
    exam_id: examId,
    file_deleted: fileDeleted,
  });
});

const bioimpedanceDeleteController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const recordId = String(req.params.id || "").trim();
  if (!recordId) {
    return res.status(400).json({ ok: false, error: "id da bioimpedancia obrigatorio" });
  }

  const existing = await getBioimpedanceRecordById(userId, recordId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "Bioimpedancia nao encontrada" });
  }

  const removed = await deleteBioimpedanceRecord(userId, recordId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "Bioimpedancia nao encontrada para remocao" });
  }

  const referencedFile = extractUploadUrlFromNotes(existing.notes);
  let fileDeleted = false;
  if (referencedFile) {
    try {
      fileDeleted = await deleteUploadedFileByUrl(referencedFile);
    } catch {
      fileDeleted = false;
    }
  }

  return res.json({
    ok: true,
    deleted: true,
    record_id: recordId,
    file_deleted: fileDeleted,
  });
});

const hydrationCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  if (!req.body.amount_ml) {
    return res.status(400).json({ ok: false, error: "amount_ml obrigatorio" });
  }

  const hydration = await createHydrationLog({ userId, ...req.body, source: req.body.source || "web" });
  return res.status(201).json({ ok: true, hydration });
});

const hydrationListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const hydration = await listHydrationLogs(userId, {
    from: req.query.from,
    to: req.query.to,
    limit: toLimit(req.query.limit, 100, 500),
  });
  return res.json({ ok: true, hydration });
});

const workoutCreateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  if (!req.body.activity_type) {
    return res.status(400).json({ ok: false, error: "activity_type obrigatorio" });
  }

  const workout = await createWorkoutSession({ userId, ...req.body, source: req.body.source || "web" });
  return res.status(201).json({ ok: true, workout });
});

const workoutListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const workouts = await listWorkoutSessions(userId, {
    from: req.query.from,
    to: req.query.to,
    limit: toLimit(req.query.limit, 100, 500),
  });
  return res.json({ ok: true, workouts });
});

const nutritionListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const nutrition = await listNutritionEntries(userId, {
    from: normalizeDateFilter(req.query.from, "from"),
    to: normalizeDateFilter(req.query.to, "to"),
    limit: toLimit(req.query.limit, 50, 300),
  });
  return res.json({ ok: true, nutrition });
});

function sumFoodItemsFieldIfPresent(items, fieldName, digits = 1) {
  const safeItems = Array.isArray(items) ? items : [];
  let hasAny = false;
  let sum = 0;

  for (const item of safeItems) {
    const value = toNumberOrNull(item?.[fieldName]);
    if (value === null) continue;
    hasAny = true;
    sum += value;
  }

  if (!hasAny) return null;
  return Number(sum.toFixed(digits));
}

const nutritionUpdateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const entryId = String(req.params.id || "").trim();
  if (!entryId) {
    return res.status(400).json({ ok: false, error: "id do lançamento obrigatório" });
  }

  const existing = await getNutritionEntryById(userId, entryId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "Lançamento não encontrado" });
  }

  const patch = {};
  const currentPayload = existing.ai_payload && typeof existing.ai_payload === "object" ? existing.ai_payload : {};
  const nextPayload = { ...currentPayload };

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "meal_slot")) {
    nextPayload.meal_slot = normalizeMealSlot(req.body.meal_slot);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "summary")) {
    const summary = String(req.body.summary || "").trim();
    patch.analyzed_summary = summary || null;
    nextPayload.summary = summary || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "raw_input_text")) {
    const rawInputText = String(req.body.raw_input_text || "").trim();
    patch.raw_input_text = rawInputText || existing.raw_input_text;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "recommended_action")) {
    patch.recommended_action = String(req.body.recommended_action || "").trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "meal_quality")) {
    const quality = String(req.body.meal_quality || "").toLowerCase().trim();
    patch.meal_quality = FOOD_QUALITY_VALUES.includes(quality) ? quality : existing.meal_quality;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "recorded_at")) {
    patch.recorded_at = normalizeRecordedAt(req.body.recorded_at) || existing.recorded_at;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, "food_items")) {
    const normalizedItems = normalizeDraftAnalysis({ food_items: req.body.food_items }).food_items;
    nextPayload.food_items = normalizedItems;

    const calories = sumFoodItemsFieldIfPresent(normalizedItems, "estimated_calories", 1);
    const protein = sumFoodItemsFieldIfPresent(normalizedItems, "protein_g", 1);
    const carbs = sumFoodItemsFieldIfPresent(normalizedItems, "carbs_g", 1);
    const fat = sumFoodItemsFieldIfPresent(normalizedItems, "fat_g", 1);
    const sodium = sumFoodItemsFieldIfPresent(normalizedItems, "sodium_mg", 0);
    const sugar = sumFoodItemsFieldIfPresent(normalizedItems, "sugar_g", 1);
    const fatGood = sumFoodItemsFieldIfPresent(normalizedItems, "fat_good_g", 1);
    const fatBad = sumFoodItemsFieldIfPresent(normalizedItems, "fat_bad_g", 1);

    if (calories !== null) patch.estimated_calories = calories;
    if (protein !== null) patch.estimated_protein_g = protein;
    if (carbs !== null) patch.estimated_carbs_g = carbs;
    if (fat !== null) patch.estimated_fat_g = fat;
    if (sodium !== null) nextPayload.sodium_mg = sodium;
    if (sugar !== null) nextPayload.sugar_g = sugar;
    if (fatGood !== null) nextPayload.fat_good_g = fatGood;
    if (fatBad !== null) nextPayload.fat_bad_g = fatBad;
  }

  patch.ai_payload = nextPayload;

  if (!Object.keys(patch).length) {
    return res.status(400).json({ ok: false, error: "Nenhum campo válido para atualizar" });
  }

  const updated = await updateNutritionEntry(userId, entryId, patch);
  if (!updated) {
    return res.status(404).json({ ok: false, error: "Lançamento não encontrado para atualização" });
  }

  return res.json({ ok: true, nutrition: updated });
});

const nutritionTextAnalyzeController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const { text } = req.body;
  const persist = parsePersistFlag(req.body?.persist, true);

  if (!text || typeof text !== "string") {
    return res.status(400).json({ ok: false, error: "text obrigatorio" });
  }

  try {
    const result = await processTextMessage({
      appUser: { id: userId },
      messageText: text,
      source: "web",
      persist,
    });

    return res.json({
      ok: true,
      analyzed: true,
      persisted: persist ? Boolean(result.nutritionSaved || (result.waterLoggedMl || 0) > 0) : false,
      nutrition_saved: persist ? Boolean(result.nutritionSaved) : false,
      water_only: Boolean(result.waterOnly),
      water_logged_ml: Number(result.waterLoggedMl || 0),
      quality: result.analysis.quality,
      analysis: result.analysis,
      replyText: result.replyText,
      modelUsed: result.modelUsed || null,
      rawResponse: result.rawResponse || null,
      rawInputText: result.rawInputText || text,
      inputType: result.inputType || "text",
      aiPayload: result.mergedAiPayload || result.analysis || null,
    });
  } catch (err) {
    const reason = normalizeOpenAiError(err);
    return res.status(503).json({
      ok: false,
      analyzed: false,
      reason,
      message: "Nao foi possivel analisar com OpenAI no momento.",
      details: err.message,
    });
  }
});

const nutritionImageAnalyzeController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const file = req.file;
  const caption = String(req.body?.caption || "");
  const persist = parsePersistFlag(req.body?.persist, true);

  if (!file) {
    return res.status(400).json({ ok: false, error: "Arquivo obrigatorio (campo file)" });
  }

  if (!String(file.mimetype || "").startsWith("image/")) {
    return res.status(400).json({ ok: false, error: "Envie uma imagem valida (jpg/png/webp)." });
  }

  try {
    const result = await processImageBufferInput({
      appUser: { id: userId },
      imageBuffer: file.buffer,
      mimeType: file.mimetype,
      caption,
      source: "web",
      inputType: "photo",
      extraAiPayload: {
        web_upload_filename: file.originalname || null,
        web_upload_mime: file.mimetype || null,
      },
      persist,
    });

    return res.json({
      ok: true,
      analyzed: true,
      persisted: persist,
      quality: result.analysis.quality,
      analysis: result.analysis,
      replyText: result.replyText,
      modelUsed: result.modelUsed || null,
      rawResponse: result.rawResponse || null,
      rawInputText: result.rawInputText || caption || "[foto sem legenda]",
      inputType: result.inputType || "photo",
      aiPayload: result.mergedAiPayload || result.analysis || null,
    });
  } catch (err) {
    const reason = normalizeOpenAiError(err);
    return res.status(503).json({
      ok: false,
      analyzed: false,
      reason,
      message: "Nao foi possivel analisar a imagem no momento.",
      details: err.message,
    });
  }
});

const nutritionAudioAnalyzeController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const file = req.file;
  const persist = parsePersistFlag(req.body?.persist, true);

  if (!file) {
    return res.status(400).json({ ok: false, error: "Arquivo obrigatorio (campo file)" });
  }

  const mimeType = String(file.mimetype || "").toLowerCase();
  if (!mimeType.startsWith("audio/") && !mimeType.includes("ogg") && !mimeType.includes("mpeg")) {
    return res.status(400).json({ ok: false, error: "Envie um audio valido (ogg/mp3/m4a/wav)." });
  }

  try {
    const result = await processAudioBufferInput({
      appUser: { id: userId },
      audioBuffer: file.buffer,
      mimeType: file.mimetype,
      filePathHint: file.originalname || "",
      source: "web",
      inputType: "audio",
      extraAiPayload: {
        web_upload_filename: file.originalname || null,
        web_upload_mime: file.mimetype || null,
      },
      persist,
    });

    return res.json({
      ok: true,
      analyzed: true,
      persisted: persist,
      quality: result.analysis.quality,
      analysis: result.analysis,
      replyText: result.replyText,
      modelUsed: result.modelUsed || null,
      rawResponse: result.rawResponse || null,
      rawInputText: result.rawInputText || "[audio sem transcricao]",
      inputType: result.inputType || "audio",
      aiPayload: result.mergedAiPayload || result.analysis || null,
    });
  } catch (err) {
    const reason = normalizeOpenAiError(err);
    return res.status(503).json({
      ok: false,
      analyzed: false,
      reason,
      message: "Nao foi possivel analisar o audio no momento.",
      details: err.message,
    });
  }
});

const nutritionRegisterDraftController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const bodyAnalysis = req.body?.analysis;
  const parsedAnalysis =
    typeof bodyAnalysis === "string"
      ? (() => {
          try {
            return JSON.parse(bodyAnalysis);
          } catch {
            return null;
          }
        })()
      : bodyAnalysis;

  if (!parsedAnalysis || typeof parsedAnalysis !== "object") {
    return res.status(400).json({
      ok: false,
      error: "analysis obrigatorio para registrar rascunho",
    });
  }

  const normalizedAnalysis = normalizeDraftAnalysis({
    ...parsedAnalysis,
    meal_slot: req.body?.meal_slot || parsedAnalysis.meal_slot,
  });

  const rawInputText = String(req.body?.raw_input_text || "").trim();
  const rawResponse = String(req.body?.raw_response || "").trim();
  const recordedAt = normalizeRecordedAt(req.body?.recorded_at);

  const result = await persistNutritionFromAnalysis({
    userId,
    analysis: normalizedAnalysis,
    rawInputText: rawInputText || normalizedAnalysis.summary || "[rascunho sem texto base]",
    inputType: normalizeInputType(req.body?.input_type || "manual"),
    source: normalizeSource(req.body?.source || "web"),
    recordedAt,
    modelUsed: String(req.body?.model_used || "").trim() || "web_draft_register",
    rawResponse: rawResponse || formatNutritionReply(normalizedAnalysis),
    extraAiPayload:
      req.body?.extra_ai_payload && typeof req.body.extra_ai_payload === "object"
        ? req.body.extra_ai_payload
        : {},
  });

  return res.status(201).json({
    ok: true,
    persisted: true,
    nutrition: result.nutrition,
    nutrition_saved: result.nutritionSaved,
    water_only: result.waterOnly,
    water_logged_ml: result.waterLoggedMl,
    analysis: normalizedAnalysis,
    replyText: formatNutritionReply(normalizedAnalysis),
  });
});

const nutritionReviseDraftController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const currentAnalysisInput = req.body?.current_analysis;
  const correctionText = String(req.body?.correction_text || "").trim();

  if (!currentAnalysisInput || typeof currentAnalysisInput !== "object") {
    return res.status(400).json({
      ok: false,
      error: "current_analysis obrigatorio",
    });
  }

  if (!correctionText) {
    return res.status(400).json({
      ok: false,
      error: "correction_text obrigatorio",
    });
  }

  try {
    const userContext = await getUserContext(userId);
    const revised = await reviseNutritionDraft({
      currentAnalysis: currentAnalysisInput,
      correctionText,
      userContext,
    });

    const normalizedAnalysis = normalizeDraftAnalysis(revised.parsed || {});
    return res.json({
      ok: true,
      revised: true,
      analysis: normalizedAnalysis,
      quality: normalizedAnalysis.quality,
      modelUsed: revised.modelUsed || null,
      rawResponse: revised.rawResponse || null,
      replyText: formatNutritionReply(normalizedAnalysis),
    });
  } catch (err) {
    const reason = normalizeOpenAiError(err);
    return res.status(503).json({
      ok: false,
      revised: false,
      reason,
      message: "Nao foi possivel revisar o rascunho no momento.",
      details: err.message,
    });
  }
});

const nutritionChatController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ ok: false, error: "text obrigatorio" });
  }

  try {
    const userContext = await getUserContext(userId);
    const chat = await chatNutritionAdvisor(text, userContext);

    await saveAiInteraction({
      user_id: userId,
      modality: "chat",
      model_used: chat.modelUsed,
      input_excerpt: text.slice(0, 3000),
      response_text: chat.replyText,
      response_json: { mode: "chat" },
    }).catch(() => {});

    return res.json({
      ok: true,
      mode: "chat",
      replyText: chat.replyText,
      modelUsed: chat.modelUsed,
    });
  } catch (err) {
    const reason = normalizeOpenAiError(err);
    return res.status(503).json({
      ok: false,
      mode: "chat",
      reason,
      message: "Nao foi possivel responder no modo conversa agora.",
      details: err.message,
    });
  }
});

const reportGenerateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const report = await generateAndStoreReport({
    userId,
    period: req.body.period || "daily",
    reportDate: req.body.report_date,
  });
  return res.json({ ok: true, report });
});

const reportListController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const reports = await listReports({
    userId,
    period: req.query.period,
    limit: toLimit(req.query.limit, 30, 120),
  });
  return res.json({ ok: true, reports });
});

const dashboardOverviewController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const overview = await getDashboardOverview(userId);
  return res.json({ ok: true, overview });
});

const workoutRecommendationController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const overview = await getDashboardOverview(userId);
  const recommendation = getWorkoutRecommendation({
    hydrationTodayMl: overview.today.hydration_total_ml,
    workoutSessionsWeek: overview.week.workout_sessions,
    latestMealQuality: overview.today.latest_nutrition?.meal_quality || null,
  });

  return res.json({
    ok: true,
    user_id: userId,
    recommendation,
  });
});

const systemUsageController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const force = parsePersistFlag(req.query?.force, false);
  const usage = await getSystemUsageSnapshot({ userId, force });
  return res.json({ ok: true, usage });
});

const fileOpenController = asyncHandler(async (req, res) => {
  const fileUrl = String(req.query?.file_url || "").trim();
  const mode = String(req.query?.mode || "")
    .trim()
    .toLowerCase();
  if (!fileUrl) {
    return res.status(400).json({ ok: false, error: "file_url obrigatorio" });
  }

  const normalized = normalizeStoredFileUrlForStorage(fileUrl);
  if (!normalized || !/^(supabase:\/\/|local:\/\/temp\/uploads\/)/i.test(normalized)) {
    return res.status(400).json({ ok: false, error: "file_url invalido para abertura segura" });
  }

  const redirectTo = await resolveFileUrlForAccess(normalized);
  if (!redirectTo) {
    return res.status(404).json({ ok: false, error: "Arquivo nao encontrado" });
  }

  if (mode === "url" || mode === "json") {
    return res.json({ ok: true, url: redirectTo });
  }

  return res.redirect(302, redirectTo);
});

const aiInfoController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const persona = getPersonaDocument();
  const profile = await getUserProfile(userId);
  const storedSettings = await getUserAiSettings(userId).catch(() => ({}));
  const resolvedAiSettings = resolveAiSettingsFromProfile(profile || null);
  const profiles = listAiProfiles();
  const personaLines = String(persona || "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  return res.json({
    ok: true,
    user_id: userId,
    ai: {
      models: resolvedAiSettings.models,
      model_labels: MODEL_LABELS,
      settings: {
        profile: resolvedAiSettings.profile,
        profile_label: resolvedAiSettings.profile_label,
        profile_description: resolvedAiSettings.profile_description,
        custom_models: resolvedAiSettings.custom_models,
        updated_at: resolvedAiSettings.updated_at || storedSettings.updated_at || null,
      },
      profiles,
      persona: {
        source_file: "doc-ia/persona-ia-edevida.md",
        preview: personaLines.slice(0, 25).join("\n"),
        full_prompt: persona,
      },
      capabilities: [
        "Analise nutricional por texto/foto/audio",
        "Configuracao de perfis de IA por usuario (Economico, Recomendado, Clinico)",
        "Classificacao de qualidade da refeicao",
        "Resumo diario (agua, refeicoes, treino, calorias e exames)",
        "Visao clinica integrada (bioimpedancia + exames)",
        "Rascunho com correcao antes de registrar",
      ],
      notes: [
        "Exames laboratoriais tem prioridade sobre bioimpedancia na leitura clinica.",
        "Upload de exame usa modelo clinico forte no perfil recomendado/clinico.",
        "Resposta de chat busca ser curta, objetiva e contextualizada com seu historico.",
      ],
    },
  });
});

const aiSettingsUpdateController = asyncHandler(async (req, res) => {
  const userId = await resolveRequestUserId(req);
  const current = safeObject(await getUserAiSettings(userId).catch(() => ({})));
  const resetCustom = parsePersistFlag(req.body?.reset_custom, false);
  const replaceCustom = parsePersistFlag(req.body?.replace_custom, false);
  const bodyModels = safeObject(req.body?.models || req.body?.custom_models);

  const mergedModels = resetCustom
    ? {}
    : replaceCustom
      ? bodyModels
      : {
        ...safeObject(current.custom_models),
        ...bodyModels,
      };

  const nextStored = buildAiSettingsForStorage({
    profile: req.body?.profile || current.profile,
    custom_models: mergedModels,
  });

  await saveUserAiSettings(userId, nextStored);
  const profile = await getUserProfile(userId);
  const resolved = resolveAiSettingsFromProfile(profile || null);

  return res.json({
    ok: true,
    user_id: userId,
    settings: {
      profile: resolved.profile,
      profile_label: resolved.profile_label,
      profile_description: resolved.profile_description,
      models: resolved.models,
      custom_models: resolved.custom_models,
      updated_at: resolved.updated_at,
    },
    profiles: listAiProfiles(),
    model_labels: MODEL_LABELS,
  });
});

module.exports = {
  authConfigController,
  authMeController,
  usersListController,
  userProfileUpsertController,
  userProfileGetController,
  userGoalCreateController,
  userGoalListController,
  bodyMeasurementCreateController,
  bodyMeasurementProgressPhotoUploadController,
  bodyMeasurementListController,
  bodyMeasurementDeleteController,
  bioimpedanceCreateController,
  bioimpedanceUploadController,
  bioimpedanceListController,
  bioimpedanceDeleteController,
  medicalExamCreateController,
  medicalExamUploadController,
  medicalExamListController,
  medicalExamUpdateController,
  medicalExamDeleteController,
  hydrationCreateController,
  hydrationListController,
  workoutCreateController,
  workoutListController,
  nutritionListController,
  nutritionUpdateController,
  nutritionTextAnalyzeController,
  nutritionImageAnalyzeController,
  nutritionAudioAnalyzeController,
  nutritionRegisterDraftController,
  nutritionReviseDraftController,
  nutritionChatController,
  aiInfoController,
  aiSettingsUpdateController,
  systemUsageController,
  fileOpenController,
  reportGenerateController,
  reportListController,
  dashboardOverviewController,
  workoutRecommendationController,
};
