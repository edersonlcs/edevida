const { cfg } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { logInfo } = require("../utils/logger");
const { getWebhookInfo, sendMessage } = require("../integrations/telegramClient");
const { storeTelegramUpdate } = require("../services/telegramUpdateService");
const { findOrCreateUserFromTelegram, resolveUserId } = require("../services/userService");
const { getUserContext } = require("../services/userContextService");
const { chatNutritionAdvisor } = require("../services/nutritionAiService");
const { getDashboardOverview } = require("../services/dashboardService");
const {
  listNutritionEntries,
  listHydrationLogs,
  listWorkoutSessions,
  listMedicalExams,
  listBioimpedanceRecords,
} = require("../services/trackingDataService");
const {
  processTextMessage,
  processPhotoMessage,
  processAudioMessage,
} = require("../services/telegramMessageProcessor");
const {
  saveAiInteraction,
  saveHydrationLog,
  saveNutritionEntry,
} = require("../services/nutritionEntryService");

function buildTelegramMainKeyboard() {
  return {
    keyboard: [
      [{ text: "Resumo de hoje" }, { text: "Status do corpo" }],
      [{ text: "Registrar refeicao" }, { text: "Sugestao proximo refeicao" }],
      [{ text: "Plano de hoje" }, { text: "Falar com IA" }],
      [{ text: "Painel" }, { text: "Help" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Envie refeição, foto, áudio ou use /chat",
  };
}

function buildTelegramDraftKeyboard() {
  return {
    keyboard: [
      [{ text: "Registrar refeicao" }, { text: "Cancelar rascunho" }],
      [{ text: "Definir Cafe da manha" }, { text: "Definir Almoco" }, { text: "Definir Janta" }],
      [{ text: "Definir Lanche da manha" }, { text: "Definir Lanche da tarde" }, { text: "Definir Ceia" }],
      [{ text: "Definir Outro" }, { text: "Voltar menu" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Ajuste o rascunho e toque em Registrar refeicao",
  };
}

async function safeReply(chatId, text, replyToMessageId, extra = {}) {
  const payload = {
    reply_markup: buildTelegramMainKeyboard(),
    ...extra,
  };

  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  try {
    await sendMessage(chatId, text, payload);
  } catch (err) {
    logInfo("telegram_send_message_failed", { chatId, error: err.message });

    if (payload.reply_to_message_id && String(err.message || "").toLowerCase().includes("replied not found")) {
      try {
        const retryPayload = { ...payload };
        delete retryPayload.reply_to_message_id;
        await sendMessage(chatId, text, retryPayload);
      } catch (retryErr) {
        logInfo("telegram_send_message_retry_failed", { chatId, error: retryErr.message });
      }
    }
  }
}

const DRAFT_TTL_MS = 1000 * 60 * 60 * 6;
const nutritionDraftStore = new Map();

const QUALITY_RANK = {
  otimo: 5,
  bom: 4,
  "ainda pode, mas pouco": 3,
  ruim: 2,
  "nunca coma": 1,
};

const DRAFT_SLOT_OPTIONS = [
  { slot: "cafe_da_manha", label: "Cafe da manha", aliases: ["cafe da manha", "cafe", "cafe da manhã"] },
  { slot: "lanche_da_manha", label: "Lanche da manha", aliases: ["lanche da manha", "lanche manha"] },
  { slot: "almoco", label: "Almoco", aliases: ["almoco", "almoço"] },
  { slot: "lanche_da_tarde", label: "Lanche da tarde", aliases: ["lanche da tarde", "lanche tarde"] },
  { slot: "janta", label: "Janta", aliases: ["janta", "jantar"] },
  { slot: "ceia", label: "Ceia", aliases: ["ceia"] },
  { slot: "outro", label: "Outro", aliases: ["outro"] },
];

function getDraftKey(appUserId, chatId) {
  return `${appUserId}:${chatId}`;
}

function getNutritionDraft(appUserId, chatId) {
  const key = getDraftKey(appUserId, chatId);
  const draft = nutritionDraftStore.get(key);
  if (!draft) return null;

  if (Date.now() - draft.updatedAt > DRAFT_TTL_MS) {
    nutritionDraftStore.delete(key);
    return null;
  }

  return draft;
}

function setNutritionDraft(appUserId, chatId, draft) {
  const key = getDraftKey(appUserId, chatId);
  nutritionDraftStore.set(key, {
    ...draft,
    updatedAt: Date.now(),
  });
}

function clearNutritionDraft(appUserId, chatId) {
  nutritionDraftStore.delete(getDraftKey(appUserId, chatId));
}

function rankQuality(value) {
  const normalized = String(value || "").toLowerCase();
  return QUALITY_RANK[normalized] || 0;
}

function pickMoreConservativeQuality(currentValue, nextValue) {
  const currentRank = rankQuality(currentValue);
  const nextRank = rankQuality(nextValue);
  if (!currentRank) return nextValue || currentValue || "bom";
  if (!nextRank) return currentValue;
  return nextRank < currentRank ? nextValue : currentValue;
}

function normalizeFoodName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeFoodItems(currentItems, nextItems) {
  const map = new Map();

  for (const item of currentItems || []) {
    const key = normalizeFoodName(item.food_name || item.name || "");
    if (!key) continue;
    map.set(key, { ...item });
  }

  for (const item of nextItems || []) {
    const key = normalizeFoodName(item.food_name || item.name || "");
    if (!key) continue;

    const current = map.get(key);
    if (!current) {
      map.set(key, { ...item });
      continue;
    }

    map.set(key, {
      ...current,
      ...item,
      quality: pickMoreConservativeQuality(current.quality, item.quality),
      portion: item.portion || current.portion,
      reason: item.reason || current.reason,
    });
  }

  return [...map.values()].slice(0, 14);
}

function pickMealSlotFromText(rawText) {
  const normalized = normalizeIntentText(rawText);
  if (!normalized) return null;
  for (const item of DRAFT_SLOT_OPTIONS) {
    if (item.aliases.some((alias) => normalized.includes(normalizeIntentText(alias)))) {
      return item.slot;
    }
  }
  return null;
}

function resolveDraftAction(rawText) {
  const normalized = normalizeIntentText(rawText);
  if (!normalized) return null;

  if (["registrar refeicao", "registrar refeição", "registrar", "salvar refeicao", "salvar refeição"].includes(normalized)) {
    return { type: "register" };
  }

  if (["cancelar rascunho", "cancelar", "descartar rascunho"].includes(normalized)) {
    return { type: "cancel" };
  }

  if (["voltar menu", "voltar", "menu"].includes(normalized)) {
    return { type: "menu" };
  }

  if (normalized.startsWith("definir ")) {
    const slot = pickMealSlotFromText(normalized.replace(/^definir\s+/, ""));
    if (slot) return { type: "set_slot", slot };
  }

  return null;
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

function mergeDraftAnalysis(baseAnalysis, incomingAnalysis, incomingRawText = "") {
  const explicitSlot = pickMealSlotFromText(incomingRawText);
  const summaryParts = [baseAnalysis.summary, incomingAnalysis.summary]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const uniqueSummary = [...new Set(summaryParts)];

  const merged = {
    ...baseAnalysis,
    ...incomingAnalysis,
    meal_slot: explicitSlot || incomingAnalysis.meal_slot || baseAnalysis.meal_slot || "outro",
    summary: uniqueSummary.join(" | ").slice(0, 900),
    quality: pickMoreConservativeQuality(baseAnalysis.quality, incomingAnalysis.quality),
    impact: incomingAnalysis.impact || baseAnalysis.impact,
    action_now: incomingAnalysis.action_now || baseAnalysis.action_now,
    next_step: incomingAnalysis.next_step || baseAnalysis.next_step,
    hydration_tip: incomingAnalysis.hydration_tip || baseAnalysis.hydration_tip,
    water_intake_ml: Math.max(
      Number(baseAnalysis.water_intake_ml || 0),
      Number(incomingAnalysis.water_intake_ml || 0)
    ),
    water_recommended_ml: Math.max(
      Number(baseAnalysis.water_recommended_ml || 0),
      Number(incomingAnalysis.water_recommended_ml || 0)
    ),
    estimated_calories: Math.max(
      Number(baseAnalysis.estimated_calories || 0),
      Number(incomingAnalysis.estimated_calories || 0)
    ),
    protein_g: Math.max(Number(baseAnalysis.protein_g || 0), Number(incomingAnalysis.protein_g || 0)),
    carbs_g: Math.max(Number(baseAnalysis.carbs_g || 0), Number(incomingAnalysis.carbs_g || 0)),
    fat_g: Math.max(Number(baseAnalysis.fat_g || 0), Number(incomingAnalysis.fat_g || 0)),
    food_items: mergeFoodItems(baseAnalysis.food_items || [], incomingAnalysis.food_items || []),
  };

  return merged;
}

function formatDraftPreview(draft) {
  const analysis = draft.analysis || {};
  const mealLabel = mealSlotLabel(analysis.meal_slot || "outro");
  const foodItems = Array.isArray(analysis.food_items) ? analysis.food_items : [];
  const topItems = foodItems.slice(0, 6);

  const lines = [
    "Rascunho da refeicao (ainda nao registrado)",
    "",
    `Refeicao: ${mealLabel}`,
    `Qualidade: ${analysis.quality || "-"}`,
    `Resumo: ${analysis.summary || "-"}`,
    `Impacto: ${analysis.impact || "-"}`,
    `Acao agora: ${analysis.action_now || "-"}`,
    "",
    "Itens identificados:",
  ];

  if (!topItems.length) {
    lines.push("- Sem itens detalhados ainda.");
  } else {
    for (const item of topItems) {
      lines.push(`- ${item.food_name || "Item"} | ${item.portion || "porcao nao informada"} | ${item.quality || "-"}`);
      if (item.reason) lines.push(`  motivo: ${item.reason}`);
    }
  }

  lines.push("", "Se precisar, envie mais texto/foto/audio para ajustar.");
  lines.push("Quando estiver certo, toque em: Registrar refeicao.");

  return lines.join("\n");
}

async function persistDraftNutritionEntry({ appUser, draft, source = "telegram" }) {
  const analysis = draft.analysis || {};
  const latestInput = draft.inputs?.[draft.inputs.length - 1] || {};
  const rawInputText = latestInput.rawInputText || "[rascunho sem entrada]";
  const aiPayload = {
    ...analysis,
    draft_inputs: draft.inputs || [],
  };

  await saveNutritionEntry({
    user_id: appUser.id,
    input_type: latestInput.inputType || "text",
    source,
    raw_input_text: rawInputText,
    analyzed_summary: analysis.summary || null,
    meal_quality: analysis.quality || null,
    recommended_action: analysis.action_now || null,
    estimated_calories: analysis.estimated_calories ?? null,
    estimated_protein_g: analysis.protein_g ?? null,
    estimated_carbs_g: analysis.carbs_g ?? null,
    estimated_fat_g: analysis.fat_g ?? null,
    water_ml_recommended: analysis.water_recommended_ml ?? null,
    ai_payload: aiPayload,
  });

  const modelUsed = (draft.models || []).join(" -> ") || "unknown";
  await saveAiInteraction({
    user_id: appUser.id,
    modality: latestInput.modality || "text",
    model_used: modelUsed,
    input_excerpt: String(rawInputText).slice(0, 3000),
    response_text: draft.lastRawResponse || "",
    response_json: aiPayload,
  }).catch(() => {});

  let safeWaterIntakeMl = sanitizeWaterIntakePerMessage(analysis.water_intake_ml);
  if ((latestInput.inputType === "text" || latestInput.inputType === "audio") && !hasExplicitWaterAmount(rawInputText)) {
    safeWaterIntakeMl = 0;
  }

  if (safeWaterIntakeMl > 0) {
    await saveHydrationLog({
      user_id: appUser.id,
      amount_ml: safeWaterIntakeMl,
      source,
      notes: `Registro automatico extraido de rascunho ${latestInput.inputType || "text"}`,
    }).catch(() => {});
  }
}

function detectModality(message) {
  if (message?.text) return "text";
  if (Array.isArray(message?.photo) && message.photo.length > 0) return "vision";
  if (message?.voice || message?.audio) return "audio";
  return "chat";
}

function normalizeOpenAiError(err) {
  const message = String(err?.message || "");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("insufficient_quota") || lowerMessage.includes("quota")) {
    return {
      code: "OPENAI_QUOTA",
      userMessage:
        "Nao consegui analisar com IA agora por falta de credito/quota da OpenAI. Assim que regularizar os creditos, volto a responder com analise completa.",
    };
  }

  if (lowerMessage.includes("rate limit")) {
    return {
      code: "OPENAI_RATE_LIMIT",
      userMessage:
        "A OpenAI esta com limite temporario de requisicoes. Tente novamente em alguns instantes.",
    };
  }

  if (lowerMessage.includes("invalid mime type") || lowerMessage.includes("unsupported image")) {
    return {
      code: "OPENAI_INVALID_MEDIA",
      userMessage:
        "Nao consegui ler essa imagem no formato atual. Tente reenviar a foto em JPG/PNG ou envie texto complementar da refeicao.",
    };
  }

  return {
    code: "OPENAI_UNAVAILABLE",
    userMessage: "Nao consegui analisar com IA agora. Tente novamente em alguns minutos.",
  };
}

const TELEGRAM_MEAL_SLOTS = [
  { key: "cafe_da_manha", label: "Café da manhã" },
  { key: "lanche_da_manha", label: "Lanche da manhã" },
  { key: "almoco", label: "Almoço" },
  { key: "lanche_da_tarde", label: "Lanche da tarde" },
  { key: "janta", label: "Janta" },
  { key: "ceia", label: "Ceia" },
  { key: "outro", label: "Outro" },
];

function mealSlotLabel(slot) {
  return TELEGRAM_MEAL_SLOTS.find((item) => item.key === slot)?.label || "Outro";
}

function inferMealSlotByText(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("cafe da manha") || value.includes("café da manhã") || value.includes("desjejum")) {
    return "cafe_da_manha";
  }
  if (value.includes("lanche da manha") || value.includes("lanche da manhã")) return "lanche_da_manha";
  if (value.includes("almoco") || value.includes("almoço")) return "almoco";
  if (value.includes("lanche da tarde")) return "lanche_da_tarde";
  if (value.includes("janta") || value.includes("jantar")) return "janta";
  if (value.includes("ceia")) return "ceia";
  return null;
}

function inferMealSlotByTime(dateValue) {
  const date = new Date(dateValue || new Date().toISOString());
  const hour = date.getHours();

  if (hour >= 5 && hour < 9) return "cafe_da_manha";
  if (hour >= 9 && hour < 11) return "lanche_da_manha";
  if (hour >= 11 && hour < 14) return "almoco";
  if (hour >= 14 && hour < 18) return "lanche_da_tarde";
  if (hour >= 18 && hour < 22) return "janta";
  return "ceia";
}

function resolveMealSlot(entry) {
  const slotFromPayload = entry?.ai_payload?.meal_slot;
  if (slotFromPayload && TELEGRAM_MEAL_SLOTS.some((item) => item.key === slotFromPayload)) {
    return slotFromPayload;
  }

  const slotFromText = inferMealSlotByText(entry.raw_input_text || entry.analyzed_summary);
  if (slotFromText) return slotFromText;

  return inferMealSlotByTime(entry.recorded_at);
}

function todayDateInTimezone(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateBr(value) {
  if (!value) return "-";
  const raw = String(value);
  const date = raw.includes("T") ? new Date(raw) : new Date(`${raw}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatDateTimeBr(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR", {
    timeZone: cfg.appTimezone || "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeIntentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectShortcutIntent(rawText) {
  const normalized = normalizeIntentText(rawText);
  if (!normalized) return null;

  if (["/start", "/help", "help", "ajuda"].includes(normalized)) {
    return "help";
  }

  if (["/resumo", "resumo", "resumo de hoje", "ver resumo"].includes(normalized)) {
    return "summary";
  }

  if (["/painel", "painel", "abrir painel", "abrir web"].includes(normalized)) {
    return "panel";
  }

  if (["/exames", "exames", "status exames", "meus exames"].includes(normalized)) {
    return "exams";
  }

  if (["/corpo", "corpo", "status do corpo", "status corpo", "visao do corpo", "visao corpo"].includes(normalized)) {
    return "body_status";
  }

  if (["falar com ia", "conversar com ia", "modo chat", "chat"].includes(normalized)) {
    return "chat_help";
  }

  return null;
}

function parseQuickChatButtonPrompt(rawText) {
  const normalized = normalizeIntentText(rawText);
  if (!normalized) return null;

  const quickPrompts = {
    "sugestao proxima refeicao":
      "Me sugira a proxima refeicao de forma simples, com porcoes e foco no meu objetivo.",
    "sugestao proximo refeicao":
      "Me sugira a proxima refeicao de forma simples, com porcoes e foco no meu objetivo.",
    "plano de hoje":
      "Monte um plano curto para o restante de hoje com base no meu status corporal e exames.",
  };

  return quickPrompts[normalized] || null;
}

function normalizeMarkerName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findMarkerByAliases(markers, aliases) {
  const entries = Object.entries(markers || {});
  for (const [name, payload] of entries) {
    const normalized = normalizeMarkerName(name);
    const tokens = normalized.replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);

    const matches = aliases.some((alias) => {
      const normalizedAlias = normalizeMarkerName(alias);
      if (normalizedAlias.length <= 3) {
        return tokens.includes(normalizedAlias);
      }
      return normalized.includes(normalizedAlias);
    });

    if (matches) return { name, payload };
  }

  return null;
}

function formatMarkerSummaryLine(markers, label, aliases) {
  const found = findMarkerByAliases(markers, aliases);
  if (!found) return `- ${label}: sem dado`;

  const value = found.payload?.value ?? "n/d";
  const unit = found.payload?.unit ? ` ${found.payload.unit}` : "";
  const flag = String(found.payload?.flag || "").toLowerCase();
  const status = flag === "high" ? " (alto)" : flag === "low" ? " (baixo)" : "";

  return `- ${label}: ${value}${unit}${status}`;
}

function markerImpactText(markerName, direction) {
  const name = normalizeMarkerName(markerName);
  const isHigh = direction === "alto";

  if (name.includes("creatinina") || name.includes("ureia") || name.includes("acido urico")) {
    return isHigh
      ? "Risco de sobrecarga renal e pior filtragem."
      : "Pode indicar alteracao de metabolismo/proteina.";
  }

  if (name.includes("tgp") || name.includes("alt") || name.includes("tgo") || name.includes("ast") || name.includes("ggt")) {
    return isHigh
      ? "Sinal de estresse no figado."
      : "Alteracao hepatica leve, precisa contexto completo.";
  }

  if (name.includes("ldl") || name.includes("colesterol") || name.includes("triglicer")) {
    return isHigh
      ? "Risco cardiovascular aumentado."
      : "Precisa leitura junto com HDL e triglicerides.";
  }

  if (name.includes("glicose") || name.includes("glicemia") || name.includes("hba1c") || name.includes("hemoglobina glicada")) {
    return isHigh
      ? "Risco metabolico/diabetes maior."
      : "Pode indicar oscilacao glicemica.";
  }

  return "Pode impactar saude metabolica e recuperacao.";
}

function extractExamAlerts(markers, max = 3) {
  if (!markers || typeof markers !== "object") return [];

  const alerts = [];
  for (const [name, payload] of Object.entries(markers)) {
    const flag = String(payload?.flag || "").toLowerCase();
    if (flag !== "high" && flag !== "low") continue;

    const direction = flag === "high" ? "alto" : "baixo";
    const value = payload?.value ?? "n/d";
    const unit = payload?.unit ? ` ${payload.unit}` : "";
    alerts.push(`${name}: ${value}${unit} (${direction})`);
  }

  return alerts.slice(0, max);
}

function buildMealSlotSummary(entries) {
  const grouped = Object.fromEntries(TELEGRAM_MEAL_SLOTS.map((slot) => [slot.key, []]));
  for (const entry of entries || []) {
    const slot = resolveMealSlot(entry);
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push(entry);
  }

  return TELEGRAM_MEAL_SLOTS.filter((item) => item.key !== "outro")
    .map((slot) => {
      const slotEntries = grouped[slot.key] || [];
      const latestQuality = slotEntries[0]?.meal_quality;
      return `- ${slot.label}: ${slotEntries.length}${latestQuality ? ` (${latestQuality})` : ""}`;
    })
    .join("\n");
}

function buildQualitySummary(entries) {
  const counters = {
    otimo: 0,
    bom: 0,
    "ainda pode, mas pouco": 0,
    ruim: 0,
    "nunca coma": 0,
  };

  for (const entry of entries || []) {
    if (counters[entry.meal_quality] !== undefined) {
      counters[entry.meal_quality] += 1;
    }
  }

  return `ótimo ${counters.otimo} | bom ${counters.bom} | moderado ${counters["ainda pode, mas pouco"]} | ruim ${counters.ruim} | nunca ${counters["nunca coma"]}`;
}

function clinicalLevelTag(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "emergencia") return "EMERGENCIA";
  if (normalized === "ruim") return "RUIM";
  if (normalized === "ainda da para melhorar") return "MELHORAR";
  if (normalized === "bom") return "BOM";
  if (normalized === "otimo") return "OTIMO";
  return "SEM DADO";
}

function buildClinicalLines(clinical, limit = 5) {
  const insights = clinical?.insights || [];
  if (!insights.length) {
    return ["Sem analise clinica suficiente ainda."];
  }

  return insights.slice(0, limit).map((item) => {
    const current = item?.current || "sem dado";
    return `- ${item.title}: ${clinicalLevelTag(item.label)} (${current})`;
  });
}

function shouldUseChatMode(messageText) {
  const text = String(messageText || "").trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("/chat")) return true;
  if (text.startsWith("duvida:") || text.startsWith("dúvida:") || text.startsWith("pergunta:")) return true;
  if (text.includes("?")) return true;
  return false;
}

function parseChatCommand(text) {
  const raw = String(text || "").trim();
  if (!raw.toLowerCase().startsWith("/chat")) return null;
  return raw.slice(5).trim();
}

async function runChatMode({ appUser, text, chatId, replyToMessageId }) {
  const userContext = await getUserContext(appUser.id);
  const chat = await chatNutritionAdvisor(text, userContext);

  await saveAiInteraction({
    user_id: appUser.id,
    modality: "chat",
    model_used: chat.modelUsed,
    input_excerpt: text.slice(0, 3000),
    response_text: chat.replyText,
    response_json: { mode: "chat" },
  }).catch(() => {});

  const reply = ["Modo conversa (sem registro automático).", "", chat.replyText].join("\n");
  await safeReply(chatId, reply, replyToMessageId);
}

async function buildTelegramDailySummary(userId) {
  const today = todayDateInTimezone(cfg.appTimezone);
  const from = `${today}T00:00:00-03:00`;
  const to = `${today}T23:59:59-03:00`;

  const [overview, nutrition, hydration, workouts, exams, bioRecords] = await Promise.all([
    getDashboardOverview(userId),
    listNutritionEntries(userId, { from, to, limit: 200 }),
    listHydrationLogs(userId, { from, to, limit: 300 }),
    listWorkoutSessions(userId, { from, to, limit: 120 }),
    listMedicalExams(userId, { limit: 3 }),
    listBioimpedanceRecords(userId, { limit: 3 }),
  ]);

  const hydrationTotal = hydration.reduce((acc, item) => acc + Number(item.amount_ml || 0), 0);
  const hydrationGoal = Number(overview?.today?.hydration_goal_ml || 3000);
  const hydrationPct = hydrationGoal > 0 ? Number(((hydrationTotal / hydrationGoal) * 100).toFixed(1)) : 0;
  const hydrationMissing = Math.max(0, hydrationGoal - hydrationTotal);

  const workoutMinutes = workouts.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0);
  const workoutCalories = workouts.reduce((acc, item) => acc + Number(item.calories_burned_est || 0), 0);

  const latestBio = bioRecords[0] || overview?.latest_bioimpedance || null;
  const latestExam = exams[0] || null;
  const examAlerts = extractExamAlerts(latestExam?.markers, 4);
  const actionHints = overview?.latest_reports?.[0]?.summary?.action_hints || [];
  const clinical = overview?.clinical || null;

  const lines = [
    `EdeVida - Resumo diário (${formatDateBr(today)})`,
    `Baseado no dia atual (${cfg.appTimezone}).`,
    "",
    `Água: ${hydrationTotal} / ${hydrationGoal} ml (${hydrationPct}%)`,
    `Falta para meta: ${hydrationMissing} ml`,
    "",
    `Refeições registradas: ${nutrition.length}`,
    buildMealSlotSummary(nutrition),
    `Qualidade: ${buildQualitySummary(nutrition)}`,
    "",
    `Treinos: ${workouts.length} sessão(ões), ${workoutMinutes} min, ${workoutCalories} kcal estimadas`,
    "",
    latestBio
      ? `Bioimpedância (último): gordura ${latestBio.body_fat_pct ?? "-"}% | músculo ${latestBio.muscle_mass_kg ?? "-"} kg | água ${latestBio.body_water_pct ?? "-"}%`
      : "Bioimpedância: sem registro recente.",
  ];

  if (examAlerts.length) {
    lines.push("", "Alertas do exame mais recente:");
    for (const alert of examAlerts) {
      lines.push(`- ${alert}`);
    }
  }

  if (actionHints.length) {
    lines.push("", "Ações recomendadas:");
    for (const hint of actionHints.slice(0, 3)) {
      lines.push(`- ${hint}`);
    }
  }

  if (clinical?.insights?.length) {
    lines.push(
      "",
      `Corpo (visao geral): ${clinicalLevelTag(clinical.overall_label)} (${clinical.overall_score}%)`,
      ...buildClinicalLines(clinical, 4),
      "Use /corpo para ver status completo."
    );
  }

  if (!nutrition.length && !hydration.length && !workouts.length) {
    const [lastNutrition, lastHydration, lastWorkouts] = await Promise.all([
      listNutritionEntries(userId, { limit: 1 }),
      listHydrationLogs(userId, { limit: 1 }),
      listWorkoutSessions(userId, { limit: 1 }),
    ]);

    const fallbackLines = [];
    if (lastNutrition[0]) {
      fallbackLines.push(`- Última refeição: ${formatDateTimeBr(lastNutrition[0].recorded_at)} (${lastNutrition[0].meal_quality || "sem qualidade"})`);
    }
    if (lastHydration[0]) {
      fallbackLines.push(`- Última água: ${formatDateTimeBr(lastHydration[0].recorded_at)} (${lastHydration[0].amount_ml || 0} ml)`);
    }
    if (lastWorkouts[0]) {
      fallbackLines.push(`- Último treino: ${formatDateTimeBr(lastWorkouts[0].started_at || lastWorkouts[0].created_at)} (${lastWorkouts[0].activity_type || "treino"})`);
    }

    lines.push("", "Hoje ainda está sem registros de alimentação/água/treino.");
    if (fallbackLines.length) {
      lines.push("Últimos registros encontrados:", ...fallbackLines);
    }
  }

  lines.push("", `Painel web: ${cfg.appBaseUrl}/painel`);

  return lines.join("\n");
}

async function buildTelegramBodyStatus(userId) {
  const overview = await getDashboardOverview(userId);
  const clinical = overview?.clinical || null;

  if (!clinical?.insights?.length) {
    return [
      "Status do corpo",
      "",
      "Ainda faltam dados para analise completa.",
      "Envie bioimpedancia/exames e use /resumo novamente.",
      `Painel web: ${cfg.appBaseUrl}/painel`,
    ].join("\n");
  }

  const lines = [
    "Status do corpo (IA)",
    "",
    `Geral: ${clinicalLevelTag(clinical.overall_label)} (${clinical.overall_score}%)`,
    ...buildClinicalLines(clinical, 5),
  ];

  if (Array.isArray(clinical.highlights) && clinical.highlights.length) {
    lines.push("", "Prioridades agora:");
    for (const item of clinical.highlights.slice(0, 2)) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "Detalhes dos marcadores: /exames");
  lines.push(`Painel web: ${cfg.appBaseUrl}/painel`);
  return lines.join("\n");
}

async function buildTelegramExamsSummary(userId) {
  const exams = await listMedicalExams(userId, { limit: 10 });
  if (!exams.length) {
    return [
      "Exames - acompanhamento",
      "",
      "Ainda não há exames cadastrados.",
      `Painel web: ${cfg.appBaseUrl}/painel (aba Exames)`,
    ].join("\n");
  }

  const latest = exams[0];
  const markers = latest.markers || {};
  const alerts = extractExamAlerts(markers, 6);

  const lines = [
    "Exames - acompanhamento",
    "",
    `Último exame: ${latest.exam_name || "Exame"} (${formatDateBr(latest.exam_date || latest.created_at)})`,
    `Tipo: ${latest.exam_type || "-"}`,
    "",
    "Marcadores principais:",
    formatMarkerSummaryLine(markers, "Creatinina", ["creatinina"]),
    formatMarkerSummaryLine(markers, "Ureia", ["ureia", "urea"]),
    formatMarkerSummaryLine(markers, "TGO / AST", ["tgo", "ast"]),
    formatMarkerSummaryLine(markers, "TGP / ALT", ["tgp", "alt"]),
    formatMarkerSummaryLine(markers, "GGT", ["ggt", "gama gt", "gama glutamil"]),
  ];

  if (alerts.length) {
    lines.push("", "Alertas no exame mais recente:");
    for (const alert of alerts) {
      lines.push(`- ${alert}`);
    }

    lines.push("", "Impacto rapido:");
    for (const alert of alerts.slice(0, 3)) {
      const [namePart, rest = ""] = alert.split(":");
      const direction = rest.includes("(alto)") ? "alto" : rest.includes("(baixo)") ? "baixo" : "";
      lines.push(`- ${namePart.trim()}: ${markerImpactText(namePart, direction)}`);
    }
  }

  lines.push("", `Total de exames cadastrados: ${exams.length}`);
  lines.push(`Painel web: ${cfg.appBaseUrl}/painel (aba Exames)`);

  return lines.join("\n");
}

function getTelegramHelpText() {
  return [
    "EdeVida ativo. Como usar:",
    "",
    "1) Envie texto, foto ou audio da refeicao",
    "2) Receba o rascunho (ainda sem salvar)",
    "3) Ajuste com mais texto/foto/audio se precisar",
    "4) Toque em Registrar refeicao quando estiver certo",
    "",
    "Ex.: Almoco: arroz, feijao, frango e 400 ml de agua.",
    "",
    "Comandos:",
    "/start ou /help - mostra este guia",
    "/painel - abre o painel web",
    "/resumo - mostra resumo completo de hoje",
    "/corpo - mostra visao geral do corpo (5 niveis)",
    "/exames - mostra acompanhamento dos exames",
    "/chat <pergunta> - conversa sem registrar refeicao",
    "",
    "Botoes diarios: Resumo de hoje, Status do corpo, Registrar refeicao, Sugestao proximo refeicao, Plano de hoje, Falar com IA, Painel e Help.",
    "",
    "Dica: mensagens com '?' entram em modo conversa (sem registro).",
  ].join("\n");
}

const telegramWebhookController = asyncHandler(async (req, res) => {
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];

  if (cfg.telegramWebhookSecret && secretHeader !== cfg.telegramWebhookSecret) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED_TELEGRAM_SECRET",
    });
  }

  const update = req.body;
  if (!update || typeof update.update_id !== "number") {
    return res.status(400).json({
      ok: false,
      error: "INVALID_TELEGRAM_UPDATE",
    });
  }

  const persisted = await storeTelegramUpdate(update);
  if (persisted.duplicate) {
    return res.json({ ok: true, duplicate: true });
  }

  const message = update.message || update.edited_message;
  if (!message || !message.chat || !message.from) {
    return res.json({ ok: true, ignored: true });
  }

  const telegramUser = await findOrCreateUserFromTelegram(message.from);
  const effectiveUserId = await resolveUserId();
  const appUser = {
    ...telegramUser,
    id: effectiveUserId,
  };
  const modality = detectModality(message);

  logInfo("telegram_message_received", {
    updateId: update.update_id,
    appUserId: appUser.id,
    telegramUserId: telegramUser.id,
    chatId: message.chat.id,
    hasText: Boolean(message.text),
    hasPhoto: Array.isArray(message.photo) && message.photo.length > 0,
    hasAudio: Boolean(message.voice || message.audio),
  });

  if (message.text) {
    const rawText = String(message.text || "").trim();
    const normalizedText = rawText.toLowerCase();
    const shortcutIntent = detectShortcutIntent(rawText);
    const quickChatButtonPrompt = parseQuickChatButtonPrompt(rawText);
    const draftAction = resolveDraftAction(rawText);

    if (shortcutIntent === "help" || normalizedText === "/start" || normalizedText === "/help") {
      await safeReply(message.chat.id, getTelegramHelpText(), message.message_id);
      return res.json({ ok: true, handled: "help" });
    }

    if (shortcutIntent === "panel") {
      await safeReply(
        message.chat.id,
        `Painel web: ${cfg.appBaseUrl}/painel`,
        message.message_id
      );
      return res.json({ ok: true, handled: "painel" });
    }

    if (shortcutIntent === "summary") {
      try {
        const summary = await buildTelegramDailySummary(appUser.id);
        await safeReply(message.chat.id, summary, message.message_id);
        return res.json({ ok: true, handled: "resumo" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "resumo", analyzed: false, reason: aiError.code });
      }
    }

    if (shortcutIntent === "body_status") {
      try {
        const bodyStatus = await buildTelegramBodyStatus(appUser.id);
        await safeReply(message.chat.id, bodyStatus, message.message_id);
        return res.json({ ok: true, handled: "corpo" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "corpo", analyzed: false, reason: aiError.code });
      }
    }

    if (shortcutIntent === "exams") {
      try {
        const examsSummary = await buildTelegramExamsSummary(appUser.id);
        await safeReply(message.chat.id, examsSummary, message.message_id);
        return res.json({ ok: true, handled: "exames" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "exames", analyzed: false, reason: aiError.code });
      }
    }

    if (shortcutIntent === "chat_help") {
      await safeReply(
        message.chat.id,
        [
          "Modo conversa pronto.",
          "Use os botoes Sugestao proximo refeicao e Plano de hoje ou envie /chat com sua pergunta.",
          "Exemplo: /chat Estou com fome agora, o que comer?",
        ].join("\n"),
        message.message_id
      );
      return res.json({ ok: true, handled: "chat_help" });
    }

    if (quickChatButtonPrompt) {
      try {
        await runChatMode({
          appUser,
          text: quickChatButtonPrompt,
          chatId: message.chat.id,
          replyToMessageId: message.message_id,
        });
        return res.json({ ok: true, handled: "chat_quick_button" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "chat_quick_button", analyzed: false, reason: aiError.code });
      }
    }

    const chatCommandPrompt = parseChatCommand(rawText);
    if (chatCommandPrompt !== null) {
      if (!chatCommandPrompt) {
        await safeReply(
          message.chat.id,
          "Use /chat seguido da sua pergunta. Ex.: /chat Vou comer pizza hoje, como compenso no dia?",
          message.message_id
        );
        return res.json({ ok: true, handled: "chat_help" });
      }

      try {
        await runChatMode({
          appUser,
          text: chatCommandPrompt,
          chatId: message.chat.id,
          replyToMessageId: message.message_id,
        });
        return res.json({ ok: true, handled: "chat" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "chat", analyzed: false, reason: aiError.code });
      }
    }

    if (shouldUseChatMode(rawText)) {
      try {
        await runChatMode({
          appUser,
          text: rawText,
          chatId: message.chat.id,
          replyToMessageId: message.message_id,
        });
        return res.json({ ok: true, handled: "chat" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "chat", analyzed: false, reason: aiError.code });
      }
    }

    const activeDraft = getNutritionDraft(appUser.id, message.chat.id);
    if (draftAction?.type === "register") {
      if (!activeDraft) {
        await safeReply(
          message.chat.id,
          "Nao ha rascunho pendente. Envie texto, foto ou audio da refeicao para montar o rascunho.",
          message.message_id
        );
        return res.json({ ok: true, handled: "draft_register_missing" });
      }

      try {
        await persistDraftNutritionEntry({
          appUser,
          draft: activeDraft,
          source: "telegram",
        });
        clearNutritionDraft(appUser.id, message.chat.id);
        await safeReply(
          message.chat.id,
          "Refeicao registrada com sucesso. Quando quiser, envie nova foto/texto para o proximo registro.",
          message.message_id
        );
        return res.json({ ok: true, handled: "draft_register" });
      } catch (err) {
        const aiError = normalizeOpenAiError(err);
        await safeReply(message.chat.id, aiError.userMessage, message.message_id);
        return res.json({ ok: true, handled: "draft_register", analyzed: false, reason: aiError.code });
      }
    }

    if (draftAction?.type === "cancel") {
      if (!activeDraft) {
        await safeReply(message.chat.id, "Nao ha rascunho pendente para cancelar.", message.message_id);
        return res.json({ ok: true, handled: "draft_cancel_missing" });
      }

      clearNutritionDraft(appUser.id, message.chat.id);
      await safeReply(message.chat.id, "Rascunho cancelado.", message.message_id);
      return res.json({ ok: true, handled: "draft_cancel" });
    }

    if (draftAction?.type === "menu") {
      if (activeDraft) {
        await safeReply(
          message.chat.id,
          "Menu principal aberto. Seu rascunho continua salvo. Para retomar, envie ajuste ou toque em Registrar refeicao.",
          message.message_id
        );
      } else {
        await safeReply(message.chat.id, "Menu principal aberto.", message.message_id);
      }
      return res.json({ ok: true, handled: "menu" });
    }

    if (draftAction?.type === "set_slot") {
      if (!activeDraft) {
        await safeReply(
          message.chat.id,
          "Nao ha rascunho pendente. Envie foto/texto da refeicao primeiro.",
          message.message_id
        );
        return res.json({ ok: true, handled: "draft_set_slot_missing" });
      }

      const updatedDraft = {
        ...activeDraft,
        analysis: {
          ...activeDraft.analysis,
          meal_slot: draftAction.slot,
        },
      };
      setNutritionDraft(appUser.id, message.chat.id, updatedDraft);

      await safeReply(
        message.chat.id,
        formatDraftPreview(updatedDraft),
        message.message_id,
        { reply_markup: buildTelegramDraftKeyboard() }
      );
      return res.json({ ok: true, handled: "draft_set_slot" });
    }
  }

  if (message.text || (Array.isArray(message.photo) && message.photo.length > 0) || message.voice || message.audio) {
    try {
      const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
      const hasAudio = Boolean(message.voice || message.audio);
      const currentDraft = getNutritionDraft(appUser.id, message.chat.id);

      let analyzed = null;
      let inputModality = "text";

      if (message.text) {
        analyzed = await processTextMessage({
          appUser,
          messageText: message.text,
          source: "telegram",
          persist: false,
        });
        inputModality = "text";
      } else if (hasPhoto) {
        analyzed = await processPhotoMessage({
          appUser,
          message,
          source: "telegram",
          persist: false,
        });
        inputModality = "vision";
      } else if (hasAudio) {
        analyzed = await processAudioMessage({
          appUser,
          message,
          source: "telegram",
          persist: false,
        });
        inputModality = "audio";
      }

      const rawInputText = analyzed.rawInputText || message.text || message.caption || "[media]";
      const draftInput = {
        inputType: analyzed.inputType || (hasPhoto ? "photo" : hasAudio ? "audio" : "text"),
        modality: inputModality,
        rawInputText,
        at: new Date().toISOString(),
      };

      let nextDraft = null;
      if (currentDraft) {
        nextDraft = {
          ...currentDraft,
          analysis: mergeDraftAnalysis(currentDraft.analysis || {}, analyzed.analysis || {}, rawInputText),
          models: [...(currentDraft.models || []), analyzed.modelUsed].filter(Boolean).slice(-6),
          lastRawResponse: analyzed.rawResponse || currentDraft.lastRawResponse || "",
          inputs: [...(currentDraft.inputs || []), draftInput].slice(-20),
        };
      } else {
        const explicitSlot = pickMealSlotFromText(rawInputText);
        nextDraft = {
          analysis: {
            ...(analyzed.analysis || {}),
            meal_slot: explicitSlot || analyzed.analysis?.meal_slot || "outro",
          },
          models: [analyzed.modelUsed].filter(Boolean),
          lastRawResponse: analyzed.rawResponse || "",
          inputs: [draftInput],
        };
      }

      setNutritionDraft(appUser.id, message.chat.id, nextDraft);

      const replyPrefix = currentDraft
        ? "Rascunho atualizado com sua nova informacao."
        : "Analise concluida. Revise o rascunho antes de registrar.";

      await safeReply(
        message.chat.id,
        `${replyPrefix}\n\n${formatDraftPreview(nextDraft)}`,
        message.message_id,
        { reply_markup: buildTelegramDraftKeyboard() }
      );

      return res.json({ ok: true, analyzed: true, draft: true, quality: nextDraft.analysis?.quality || null });
    } catch (err) {
      const aiError = normalizeOpenAiError(err);

      await saveAiInteraction({
        user_id: appUser.id,
        modality,
        model_used: aiError.code,
        input_excerpt: (message.text || message.caption || "[media]").slice(0, 3000),
        response_text: err.message,
        response_json: { error: err.message, code: aiError.code },
      }).catch(() => {});

      await safeReply(message.chat.id, aiError.userMessage, message.message_id);

      logInfo("telegram_analysis_failed", {
        appUserId: appUser.id,
        modality,
        errorCode: aiError.code,
        error: err.message,
      });

      return res.json({ ok: true, analyzed: false, reason: aiError.code });
    }
  }

  await safeReply(
    message.chat.id,
    "Formato recebido. Envie texto/foto/audio para criar rascunho de refeicao, ajuste se precisar e toque em Registrar refeicao.",
    message.message_id
  );

  return res.json({ ok: true, analyzed: false });
});

const telegramWebhookInfoController = asyncHandler(async (_req, res) => {
  const info = await getWebhookInfo();
  res.json({ ok: true, info });
});

module.exports = {
  telegramWebhookController,
  telegramWebhookInfoController,
};
