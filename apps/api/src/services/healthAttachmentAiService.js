const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { openai } = require("../integrations/openaiClient");
const { cfg } = require("../config/env");
const { getPersonaDocument } = require("./personaService");
const {
  DEFAULT_TEXT_FALLBACK_MODELS,
  DEFAULT_VISION_FALLBACK_MODELS,
  runWithModelFallback,
} = require("./openaiModelFallbackService");

const execFileAsync = promisify(execFile);

const bioimpedanceSchema = {
  name: "bioimpedance_parse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      measured_at: { type: ["string", "null"] },
      weight_kg: { type: ["number", "null"] },
      bmi: { type: ["number", "null"] },
      body_fat_pct: { type: ["number", "null"] },
      fat_mass_kg: { type: ["number", "null"] },
      fat_free_mass_kg: { type: ["number", "null"] },
      muscle_mass_kg: { type: ["number", "null"] },
      body_water_pct: { type: ["number", "null"] },
      visceral_fat_level: { type: ["number", "null"] },
      bmr_kcal: { type: ["number", "null"] },
      metabolic_age: { type: ["number", "null"] },
      whr: { type: ["number", "null"] },
      ideal_weight_kg: { type: ["number", "null"] },
      weight_control_kg: { type: ["number", "null"] },
      fat_control_kg: { type: ["number", "null"] },
      muscle_control_kg: { type: ["number", "null"] },
      obesity_level_text: { type: ["string", "null"] },
      body_type_text: { type: ["string", "null"] },
      source_summary: { type: "string" },
    },
    required: [
      "measured_at",
      "weight_kg",
      "bmi",
      "body_fat_pct",
      "fat_mass_kg",
      "fat_free_mass_kg",
      "muscle_mass_kg",
      "body_water_pct",
      "visceral_fat_level",
      "bmr_kcal",
      "metabolic_age",
      "whr",
      "ideal_weight_kg",
      "weight_control_kg",
      "fat_control_kg",
      "muscle_control_kg",
      "obesity_level_text",
      "body_type_text",
      "source_summary",
    ],
  },
};

const medicalExamSchema = {
  name: "medical_exam_parse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      exam_name: { type: "string" },
      exam_type: { type: "string" },
      exam_date: { type: ["string", "null"] },
      markers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            value: { type: ["number", "string", "null"] },
            unit: { type: ["string", "null"] },
            reference_range: { type: ["string", "null"] },
            flag: { type: ["string", "null"] },
          },
          required: ["name", "value", "unit", "reference_range", "flag"],
        },
      },
      summary: { type: "string" },
      risk_flags: { type: "array", items: { type: "string" } },
    },
    required: ["exam_name", "exam_type", "exam_date", "markers", "summary", "risk_flags"],
  },
};

function buildAttachmentSystemPrompt() {
  return [
    "Voce extrai dados de saude em formato estruturado.",
    "Nao invente numeros. Se nao estiver legivel, retorne null no campo numerico.",
    "Padronize numeros com ponto decimal.",
    "Siga a persona e limites clinicos abaixo:",
    getPersonaDocument(),
  ].join(" ");
}

function buildMedicalExamSpecialistPrompt() {
  return [
    "Voce e um assistente clinico para extracao de exames laboratoriais.",
    "Atue com rigor de triagem de nefrologista e cardiologista.",
    "Priorize marcadores renais, cardiovasculares e metabolicos quando disponiveis.",
    "Nao invente dados. Campo ilegivel deve ficar null.",
    "Padronize valores e flags com consistencia.",
    "Ao preencher flags, use high/low quando estiver fora da referencia e normal quando dentro.",
    "Siga a persona e limites clinicos abaixo:",
    getPersonaDocument(),
  ].join(" ");
}

async function parseJsonWithSchema(messages, schema, model, fallbackModels = []) {
  const completion = await runWithModelFallback({
    primaryModel: model,
    fallbackModels,
    context: `health_attachment:${schema.name}`,
    runner: async (currentModel) =>
      openai.chat.completions.create({
        model: currentModel,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: schema,
        },
      }),
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia da OpenAI");
  }

  return {
    parsed: JSON.parse(content),
    rawResponse: content,
    modelUsed: completion.model || model,
  };
}

function asDataUrl(buffer, mimeType) {
  const safeType = mimeType || "image/jpeg";
  return `data:${safeType};base64,${buffer.toString("base64")}`;
}

async function analyzeBioimpedanceImage({ imageBuffer, mimeType }) {
  return parseJsonWithSchema(
    [
      { role: "system", content: buildAttachmentSystemPrompt() },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extraia os dados de bioimpedancia da imagem.",
              "Campos ausentes ou ilegiveis devem ir como null.",
              "Em source_summary, resuma o que voce conseguiu ler.",
            ].join(" "),
          },
          { type: "image_url", image_url: { url: asDataUrl(imageBuffer, mimeType) } },
        ],
      },
    ],
    bioimpedanceSchema,
    cfg.openaiModelVision,
    DEFAULT_VISION_FALLBACK_MODELS
  );
}

async function extractPdfText(absolutePath) {
  const txtPath = `${absolutePath}.txt`;
  await execFileAsync("pdftotext", [absolutePath, txtPath]);
  const text = await fs.readFile(txtPath, "utf-8");
  await fs.unlink(txtPath).catch(() => {});
  return text;
}

async function extractPdfTextFromBuffer(buffer) {
  const tempDir = path.join(os.tmpdir(), "edevida");
  await fs.mkdir(tempDir, { recursive: true });

  const fileBase = `exam-${Date.now()}-${randomUUID()}`;
  const pdfPath = path.join(tempDir, `${fileBase}.pdf`);
  const txtPath = `${pdfPath}.txt`;

  await fs.writeFile(pdfPath, buffer);
  try {
    await execFileAsync("pdftotext", [pdfPath, txtPath]);
    return await fs.readFile(txtPath, "utf-8");
  } finally {
    await fs.unlink(pdfPath).catch(() => {});
    await fs.unlink(txtPath).catch(() => {});
  }
}

async function analyzeMedicalExamText({ rawText, modelOverride }) {
  const primaryModel = String(modelOverride || "").trim() || cfg.openaiModelExamText;
  return parseJsonWithSchema(
    [
      { role: "system", content: buildMedicalExamSpecialistPrompt() },
      {
        role: "user",
        content: [
          "Extraia os dados do exame medico abaixo.",
          "Retorne markers com os principais itens numericos e flags quando houver.",
          "Texto bruto:",
          rawText.slice(0, 26000),
        ].join("\n"),
      },
    ],
    medicalExamSchema,
    primaryModel,
    [cfg.openaiModelExamText, cfg.openaiModelText, ...DEFAULT_TEXT_FALLBACK_MODELS]
  );
}

async function analyzeMedicalExamImage({ imageBuffer, mimeType, modelOverride }) {
  const primaryModel = String(modelOverride || "").trim() || cfg.openaiModelExamVision;
  return parseJsonWithSchema(
    [
      { role: "system", content: buildMedicalExamSpecialistPrompt() },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extraia os dados de exame medico desta imagem, inclusive marcadores e sinalizacoes.",
          },
          { type: "image_url", image_url: { url: asDataUrl(imageBuffer, mimeType) } },
        ],
      },
    ],
    medicalExamSchema,
    primaryModel,
    [cfg.openaiModelExamVision, cfg.openaiModelVision, ...DEFAULT_VISION_FALLBACK_MODELS]
  );
}

function markersArrayToObject(markersArray) {
  const result = {};

  for (const item of markersArray || []) {
    if (!item?.name) continue;
    result[item.name] = {
      value: item.value,
      unit: item.unit,
      reference_range: item.reference_range,
      flag: item.flag,
    };
  }

  return result;
}

function isPdfMime(mimeType, originalName = "") {
  return (
    String(mimeType || "").toLowerCase().includes("pdf") ||
    path.extname(originalName).toLowerCase() === ".pdf"
  );
}

function isImageMime(mimeType, originalName = "") {
  const loweredMime = String(mimeType || "").toLowerCase();
  if (loweredMime.startsWith("image/")) return true;

  const ext = path.extname(originalName).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".heic"].includes(ext);
}

module.exports = {
  analyzeBioimpedanceImage,
  analyzeMedicalExamText,
  analyzeMedicalExamImage,
  extractPdfText,
  extractPdfTextFromBuffer,
  markersArrayToObject,
  isPdfMime,
  isImageMime,
};
