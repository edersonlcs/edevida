const { asyncHandler } = require("../utils/asyncHandler");
const { resolveUserId, listUsers, createDefaultUserIfNeeded } = require("../services/userService");
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
const { chatNutritionAdvisor, formatNutritionReply } = require("../services/nutritionAiService");
const {
  upsertUserProfile,
  getUserProfile,
  createGoal,
  listGoals,
  createBodyMeasurement,
  listBodyMeasurements,
  createBioimpedanceRecord,
  listBioimpedanceRecords,
  createMedicalExam,
  listMedicalExams,
  createHydrationLog,
  listHydrationLogs,
  createWorkoutSession,
  listWorkoutSessions,
  listNutritionEntries,
} = require("../services/trackingDataService");
const { saveUploadedFile, localToWebFileUrl } = require("../services/attachmentStorageService");
const { generateAndStoreReport, listReports } = require("../services/reportService");
const { getDashboardOverview } = require("../services/dashboardService");
const { getWorkoutRecommendation } = require("../services/workoutPlannerService");
const {
  analyzeBioimpedanceImage,
  analyzeMedicalExamText,
  analyzeMedicalExamImage,
  extractPdfText,
  markersArrayToObject,
  isPdfMime,
  isImageMime,
} = require("../services/healthAttachmentAiService");

function toLimit(value, fallback = 30, max = 200) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeStoredFileUrl(fileUrl) {
  if (!fileUrl) return null;
  return localToWebFileUrl(fileUrl);
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

function hasExplicitWaterAmount(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const hasWaterWord = value.includes("agua") || value.includes("água");
  const hasAmount = /\b\d+(?:[.,]\d+)?\s?(ml|l|litro|litros)\b/.test(value);
  return hasWaterWord && hasAmount;
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
    food_items: foodItems,
  };
}

async function persistNutritionFromAnalysis({
  userId,
  analysis,
  rawInputText,
  inputType,
  source,
  modelUsed,
  rawResponse,
  extraAiPayload,
}) {
  const normalizedAnalysis = normalizeDraftAnalysis(analysis);
  const mergedAiPayload = {
    ...normalizedAnalysis,
    ...(extraAiPayload && typeof extraAiPayload === "object" ? extraAiPayload : {}),
  };

  const nutrition = await saveNutritionEntry({
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
    ai_payload: mergedAiPayload,
  });

  await saveAiInteraction({
    user_id: userId,
    modality: mapInputTypeToModality(inputType),
    model_used: modelUsed || "web_draft",
    input_excerpt: String(rawInputText || "[registro web sem texto]").slice(0, 3000),
    response_text: String(rawResponse || ""),
    response_json: mergedAiPayload,
  }).catch(() => {});

  let safeWaterIntakeMl = sanitizeWaterIntakePerMessage(normalizedAnalysis.water_intake_ml);
  if ((inputType === "text" || inputType === "audio") && !hasExplicitWaterAmount(rawInputText)) {
    safeWaterIntakeMl = 0;
  }

  if (safeWaterIntakeMl > 0) {
    await saveHydrationLog({
      user_id: userId,
      amount_ml: safeWaterIntakeMl,
      source: normalizeSource(source),
      notes: `Registro automatico extraido de rascunho ${normalizeInputType(inputType)}`,
    }).catch(() => {});
  }

  return nutrition;
}

async function resolveRequestUserId(req) {
  return resolveUserId(req.body?.user_id || req.query?.user_id);
}

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
  const measurement = await createBodyMeasurement({ userId, ...req.body });
  return res.status(201).json({ ok: true, measurement });
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

  const storedFile = await saveUploadedFile(file);
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
    progress_photo_url: storedFile.webFileUrl,
    notes: req.body.notes || `Foto de evolucao enviada via web (${storedFile.webFileUrl})`,
    recorded_at: normalizeRecordedAt(req.body.recorded_at),
  });

  return res.status(201).json({
    ok: true,
    measurement,
    file: {
      url: storedFile.webFileUrl,
      localUrl: storedFile.localFileUrl,
      webUrl: storedFile.webFileUrl,
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
  return res.json({ ok: true, measurements });
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
  return res.json({ ok: true, records });
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
    file_url: normalizeStoredFileUrl(req.body.file_url),
  });

  return res.status(201).json({ ok: true, exam });
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

  const storedFile = await saveUploadedFile(file);
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
      notes: [
        `Fonte arquivo: ${storedFile.webFileUrl}`,
        `Resumo IA: ${parsed.source_summary}`,
        `IMC: ${parsed.bmi ?? "n/d"} | WHR: ${parsed.whr ?? "n/d"}`,
        `Tipo corpo: ${parsed.body_type_text || "n/d"} | Nivel obesidade: ${parsed.obesity_level_text || "n/d"}`,
      ].join(" | "),
    });

    let bodyMeasurement = null;
    if (parsed.weight_kg || parsed.body_fat_pct || parsed.bmi) {
      bodyMeasurement = await createBodyMeasurement({
        userId,
        weight_kg: parsed.weight_kg,
        body_fat_pct: parsed.body_fat_pct,
        recorded_at: effectiveRecordedAt,
        notes: `Registro automatico via anexo bioimpedancia (${storedFile.webFileUrl})`,
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
      record,
      body_measurement: bodyMeasurement,
      parsed,
      file: {
        url: storedFile.webFileUrl,
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
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
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
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

  const storedFile = await saveUploadedFile(file);
  const baseExamName = req.body.exam_name || "Exame anexado";
  const baseExamType = req.body.exam_type || "anexo";
  const baseExamDate = normalizeRecordedAt(req.body.exam_date);

  try {
    let ai = null;

    if (isPdfMime(storedFile.mimeType, file.originalname)) {
      const extractedText = await extractPdfText(storedFile.absolutePath);
      ai = await analyzeMedicalExamText({ rawText: extractedText });
    } else if (isImageMime(storedFile.mimeType, file.originalname)) {
      ai = await analyzeMedicalExamImage({
        imageBuffer: file.buffer,
        mimeType: storedFile.mimeType,
      });
    } else {
      const exam = await createMedicalExam({
        userId,
        exam_name: baseExamName,
        exam_type: baseExamType,
        exam_date: baseExamDate,
        markers: {},
        file_url: storedFile.webFileUrl,
        notes: "Arquivo salvo, formato nao suportado para analise IA automatica.",
      });

      return res.status(201).json({
        ok: true,
        analyzed: false,
        exam,
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
      file_url: storedFile.webFileUrl,
      notes: [parsed.summary, ...(parsed.risk_flags || []).map((item) => `Risco: ${item}`)].join(" | "),
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
      exam,
      parsed,
      file: {
        url: storedFile.webFileUrl,
        localUrl: storedFile.localFileUrl,
        webUrl: storedFile.webFileUrl,
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
      file_url: storedFile.webFileUrl,
      notes: `Arquivo salvo sem analise IA. Motivo: ${err.message}`,
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
      exam: fallbackExam,
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
    file_url: normalizeStoredFileUrl(exam.file_url),
  }));

  return res.json({ ok: true, exams: normalized });
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
      persisted: persist,
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

  const nutrition = await persistNutritionFromAnalysis({
    userId,
    analysis: normalizedAnalysis,
    rawInputText: rawInputText || normalizedAnalysis.summary || "[rascunho sem texto base]",
    inputType: normalizeInputType(req.body?.input_type || "manual"),
    source: normalizeSource(req.body?.source || "web"),
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
    nutrition,
    analysis: normalizedAnalysis,
    replyText: formatNutritionReply(normalizedAnalysis),
  });
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

module.exports = {
  usersListController,
  userProfileUpsertController,
  userProfileGetController,
  userGoalCreateController,
  userGoalListController,
  bodyMeasurementCreateController,
  bodyMeasurementProgressPhotoUploadController,
  bodyMeasurementListController,
  bioimpedanceCreateController,
  bioimpedanceUploadController,
  bioimpedanceListController,
  medicalExamCreateController,
  medicalExamUploadController,
  medicalExamListController,
  hydrationCreateController,
  hydrationListController,
  workoutCreateController,
  workoutListController,
  nutritionListController,
  nutritionTextAnalyzeController,
  nutritionImageAnalyzeController,
  nutritionAudioAnalyzeController,
  nutritionRegisterDraftController,
  nutritionChatController,
  reportGenerateController,
  reportListController,
  dashboardOverviewController,
  workoutRecommendationController,
};
