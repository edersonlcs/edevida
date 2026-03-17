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
const { saveAiInteraction } = require("../services/nutritionEntryService");

function buildTelegramMainKeyboard() {
  return {
    keyboard: [
      [{ text: "Resumo de hoje" }, { text: "Abrir painel" }],
      [{ text: "Falar com IA" }, { text: "Bebi 300 ml de água" }],
      [{ text: "/resumo" }, { text: "/exames" }, { text: "/help" }],
      [{ text: "/chat Vou comer pizza hoje, como compenso?" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Envie refeição, foto, áudio ou use /chat",
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

  if (["/resumo", "resumo", "resumo de hoje", "ver resumo"].includes(normalized)) {
    return "summary";
  }

  if (["/painel", "painel", "abrir painel", "abrir web"].includes(normalized)) {
    return "panel";
  }

  if (["/exames", "exames", "status exames", "meus exames"].includes(normalized)) {
    return "exams";
  }

  if (["falar com ia", "conversar com ia", "modo chat", "chat"].includes(normalized)) {
    return "chat_help";
  }

  return null;
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
  }

  lines.push("", `Total de exames cadastrados: ${exams.length}`);
  lines.push(`Painel web: ${cfg.appBaseUrl}/painel (aba Exames)`);

  return lines.join("\n");
}

function getTelegramHelpText() {
  return [
    "EdeVida ativo. Como usar:",
    "",
    "1) Texto: descreva refeicao/bebida",
    "Ex.: Almoco: arroz, feijao, frango e 400 ml de agua.",
    "",
    "2) Foto: envie foto do prato",
    "3) Audio: envie audio descrevendo o que comeu",
    "",
    "Comandos:",
    "/start ou /help - mostra este guia",
    "/painel - abre o painel web",
    "/resumo - mostra resumo completo de hoje",
    "/exames - mostra acompanhamento dos exames",
    "/chat <pergunta> - conversa sem registrar refeicao",
    "",
    "Atalhos de teclado: Resumo de hoje, Abrir painel e Falar com IA.",
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

    if (normalizedText === "/start" || normalizedText === "/help") {
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
        "Modo conversa pronto. Envie /chat seguido da pergunta ou apenas mande uma pergunta com '?'.",
        message.message_id
      );
      return res.json({ ok: true, handled: "chat_help" });
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
  }

  if (message.text || (Array.isArray(message.photo) && message.photo.length > 0) || message.voice || message.audio) {
    try {
      let result = null;

      if (message.text) {
        result = await processTextMessage({
          appUser,
          messageText: message.text,
          source: "telegram",
        });
      } else if (Array.isArray(message.photo) && message.photo.length > 0) {
        result = await processPhotoMessage({
          appUser,
          message,
          source: "telegram",
        });
      } else {
        result = await processAudioMessage({
          appUser,
          message,
          source: "telegram",
        });
      }

      const replyPrefix =
        message.voice || message.audio
          ? "Transcrevi seu audio e fiz a analise.\n\n"
          : Array.isArray(message.photo) && message.photo.length > 0
            ? "Analisei sua foto.\n\n"
            : "";

      await safeReply(message.chat.id, `${replyPrefix}${result.replyText}`, message.message_id);

      return res.json({ ok: true, analyzed: true, quality: result.analysis.quality });
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
    "Formato recebido. Envie texto/foto/audio para registrar, /chat para conversar e /resumo para visão do dia.",
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
