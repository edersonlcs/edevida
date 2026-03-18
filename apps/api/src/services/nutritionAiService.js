const fs = require("fs");
const path = require("path");
const { openai } = require("../integrations/openaiClient");
const { cfg } = require("../config/env");
const { FOOD_QUALITY_SCALE } = require("../config/constants");
const { getPersonaDocument } = require("./personaService");
const {
  DEFAULT_TEXT_FALLBACK_MODELS,
  DEFAULT_VISION_FALLBACK_MODELS,
  DEFAULT_TRANSCRIBE_FALLBACK_MODELS,
  runWithModelFallback,
} = require("./openaiModelFallbackService");

const responseSchema = {
  name: "nutrition_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      meal_slot: {
        type: "string",
        enum: [
          "cafe_da_manha",
          "lanche_da_manha",
          "almoco",
          "lanche_da_tarde",
          "janta",
          "ceia",
          "outro",
        ],
      },
      summary: { type: "string" },
      quality: { type: "string", enum: FOOD_QUALITY_SCALE },
      impact: { type: "string" },
      action_now: { type: "string" },
      next_step: { type: "string" },
      hydration_tip: { type: "string" },
      water_intake_ml: { type: "integer", minimum: 0 },
      water_recommended_ml: { type: "integer", minimum: 0 },
      estimated_calories: { type: "number", minimum: 0 },
      protein_g: { type: "number", minimum: 0 },
      carbs_g: { type: "number", minimum: 0 },
      fat_g: { type: "number", minimum: 0 },
      food_items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            food_name: { type: "string" },
            portion: { type: "string" },
            quality: { type: "string", enum: FOOD_QUALITY_SCALE },
            reason: { type: "string" },
          },
          required: ["food_name", "portion", "quality", "reason"],
        },
      },
    },
    required: [
      "meal_slot",
      "summary",
      "quality",
      "impact",
      "action_now",
      "next_step",
      "hydration_tip",
      "water_intake_ml",
      "water_recommended_ml",
      "estimated_calories",
      "protein_g",
      "carbs_g",
      "fat_g",
      "food_items",
    ],
  },
};

function buildSystemPrompt() {
  const personaDoc = getPersonaDocument();
  return [
    "Siga rigorosamente a persona e regras abaixo:",
    personaDoc,
    "",
    "Regras complementares de formato para esta API:",
    "Retorne exclusivamente JSON valido no schema solicitado.",
    "Classifique o periodo da refeicao em meal_slot.",
    "Liste os principais alimentos em food_items (nome, porcao, qualidade e motivo).",
    "water_intake_ml deve considerar somente agua/bebida explicitamente citada na entrada atual.",
    "Se nao houver volume claro na entrada atual, use water_intake_ml = 0.",
    "Nao inclua markdown, explicacoes extras nem texto fora do JSON.",
  ].join(" ");
}

function buildUserPrompt(messageText, userContext) {
  return [
    "Entrada principal do usuario:",
    messageText,
    "",
    "Contexto atual do usuario (JSON):",
    JSON.stringify(userContext),
    "",
    "Retorne somente JSON no schema solicitado.",
  ].join("\n");
}

function buildChatSystemPrompt() {
  const personaDoc = getPersonaDocument();
  return [
    "Siga rigorosamente a persona e regras abaixo:",
    personaDoc,
    "",
    "Modo conversa (sem registro automatico):",
    "Responda em portugues-BR, em tom humano, claro e acolhedor.",
    "Nao precisa retornar JSON neste modo.",
    "Nao use markdown.",
    "Respostas devem ser simples e objetivas: no maximo 6 frases curtas.",
    "Quando a pergunta for direta, responda direto sem introducao longa.",
    "Nao use subtitulos, blocos com titulos ou formato de relatorio.",
    "Evite resposta engessada; converse de forma natural como nutricionista e personal no dia a dia.",
    "Use dados reais do contexto (peso, gordura, exames, hidratacao) sempre que existirem.",
    "Quando o usuario perguntar sobre saude geral/exames, entregue panorama por sistemas do corpo usando a escala: Emergencia, Ruim, Ainda da para melhorar, Bom, Otimo.",
    "Para conclusao clinica, exame laboratorial tem prioridade sobre bioimpedancia.",
    "Quando houver risco, seja direto e pratico: diga o impacto e a proxima acao nas proximas horas.",
    "Se faltarem dados para concluir, diga explicitamente quais exames/medidas faltam.",
    "Em tentacao alimentar (ex: chocolate), entregue: estrategia imediata + alternativa realista + limite de porcao.",
  ].join(" ");
}

function buildChatUserPrompt(messageText, userContext) {
  return [
    "Pergunta do usuario:",
    messageText,
    "",
    "Contexto atual do usuario (JSON):",
    JSON.stringify(userContext),
    "",
    "Instrucoes finais:",
    "- Priorize respostas curtas e acionaveis.",
    "- Se perguntar sobre exames, considere clinicalOverview e latestExam.",
    "- Se perguntar sobre rotina diaria, considere hydrationTodayMl e meta de saude do contexto.",
    "- Seja objetivo: resposta com foco no que fazer agora.",
  ].join("\n");
}

function normalizeChatReplyText(rawContent) {
  const raw = String(rawContent || "");
  if (!raw) return "";

  let cleaned = raw
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .trim();

  cleaned = cleaned.replace(
    /(?:^|\n)\s*(resumo rapido|classifica(?:c|ç)(?:a|ã)o[^:\n]*|impacto esperado[^:\n]*|o que fazer agora|proxima refei(?:c|ç)(?:a|ã)o|agua hoje)\s*:\s*/gi,
    "\n"
  );

  cleaned = cleaned.replace(/\n{2,}/g, "\n").trim();
  const compact = cleaned.replace(/\n/g, " ");
  const sentences = compact.split(/(?<=[.!?])\s+/).filter(Boolean);
  const limited = sentences.slice(0, 5).join(" ").trim();

  return limited || compact;
}

async function parseStructuredNutrition(messages, model, fallbackModels = []) {
  const completion = await runWithModelFallback({
    primaryModel: model,
    fallbackModels,
    context: "nutrition_structured",
    runner: async (currentModel) =>
      openai.chat.completions.create({
        model: currentModel,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: responseSchema,
        },
      }),
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia do modelo OpenAI");
  }

  return {
    parsed: JSON.parse(content),
    modelUsed: completion.model || model,
    rawResponse: content,
  };
}

async function analyzeTextNutrition(messageText, userContext) {
  return parseStructuredNutrition(
    [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(messageText, userContext) },
    ],
    cfg.openaiModelText,
    DEFAULT_TEXT_FALLBACK_MODELS
  );
}

async function analyzeImageNutrition({ imageBuffer, mimeType, caption, userContext }) {
  const normalizedMimeType = (() => {
    const normalized = String(mimeType || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    if (normalized === "image/jpg") return "image/jpeg";
    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalized)) {
      return normalized;
    }
    return "image/jpeg";
  })();

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${normalizedMimeType};base64,${base64}`;

  const userText = buildUserPrompt(
    caption || "Analise esta imagem de refeicao e identifique alimentos/bebidas.",
    userContext
  );

  return parseStructuredNutrition(
    [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    cfg.openaiModelVision,
    DEFAULT_VISION_FALLBACK_MODELS
  );
}

async function transcribeAudioFile({ filePath }) {
  const absolutePath = path.resolve(filePath);
  const transcription = await runWithModelFallback({
    primaryModel: cfg.openaiModelTranscribe,
    fallbackModels: DEFAULT_TRANSCRIBE_FALLBACK_MODELS,
    context: "nutrition_transcribe",
    runner: async (currentModel) =>
      openai.audio.transcriptions.create({
        model: currentModel,
        file: fs.createReadStream(absolutePath),
      }),
  });

  const transcriptText = transcription.text || "";
  if (!transcriptText) {
    throw new Error("Transcricao vazia do audio");
  }

  return {
    transcriptText,
    modelUsed: cfg.openaiModelTranscribe,
  };
}

async function chatNutritionAdvisor(messageText, userContext) {
  const completion = await runWithModelFallback({
    primaryModel: cfg.openaiModelChat,
    fallbackModels: [cfg.openaiModelText, ...DEFAULT_TEXT_FALLBACK_MODELS],
    context: "nutrition_chat",
    runner: async (currentModel) =>
      openai.chat.completions.create({
        model: currentModel,
        messages: [
          { role: "system", content: buildChatSystemPrompt() },
          { role: "user", content: buildChatUserPrompt(messageText, userContext) },
        ],
      }),
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia do modo conversa");
  }

  return {
    replyText: normalizeChatReplyText(content),
    modelUsed: completion.model || cfg.openaiModelChat,
  };
}

function formatNutritionReply(analysis) {
  const itemsPreview = (analysis.food_items || [])
    .slice(0, 4)
    .map((item) => `- ${item.food_name} (${item.portion}): ${item.quality} | ${item.reason}`)
    .join("\n");

  return [
    `Qualidade: ${analysis.quality}`,
    `Resumo: ${analysis.summary}`,
    `Refeicao: ${analysis.meal_slot || "outro"}`,
    `Impacto: ${analysis.impact}`,
    `Acao agora: ${analysis.action_now}`,
    `Proximo passo: ${analysis.next_step}`,
    `Agua: ${analysis.hydration_tip}`,
    itemsPreview ? `Itens:\n${itemsPreview}` : "",
  ].join("\n");
}

module.exports = {
  analyzeTextNutrition,
  analyzeImageNutrition,
  transcribeAudioFile,
  chatNutritionAdvisor,
  formatNutritionReply,
};
