const state = {
  userId: null,
  charts: {
    weight: null,
    fat: null,
    hydration: null,
    measurements: null,
  },
  filter: {
    from: "",
    to: "",
  },
  cache: {
    dashboard: null,
    profile: null,
    reports: [],
    measurements: [],
    bioimpedance: [],
    exams: [],
    hydration: [],
    workouts: [],
    nutrition: [],
    telegramWebhook: null,
  },
  nutritionDraft: null,
};

const STATUS_CLASSES = ["status-info", "status-success", "status-warning", "status-error"];

const MEAL_SLOTS = [
  { key: "cafe_da_manha", label: "Café da manhã" },
  { key: "lanche_da_manha", label: "Lanche da manhã" },
  { key: "almoco", label: "Almoço" },
  { key: "lanche_da_tarde", label: "Lanche da tarde" },
  { key: "janta", label: "Janta" },
  { key: "ceia", label: "Ceia" },
  { key: "outro", label: "Outro" },
];

const MEAL_SLOTS_CORE = MEAL_SLOTS.filter((item) => item.key !== "outro");

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return "-";
  return parsed.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateForDisplay(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseDateForFilterBound(value, mode = "from") {
  if (!value) return null;
  const raw = String(value).trim();

  if (DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const hours = mode === "to" ? 23 : 0;
    const minutes = mode === "to" ? 59 : 0;
    const seconds = mode === "to" ? 59 : 0;
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function fmtDate(value) {
  if (!value) return "-";
  const parsed = parseDateForDisplay(value);
  if (!parsed) return String(value);
  return parsed.toLocaleDateString("pt-BR");
}

function fmtDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compactObject(source) {
  const output = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (value === "" || value === undefined || value === null) continue;
    output[key] = value;
  }
  return output;
}

function formToObject(form) {
  const formData = new FormData(form);
  return compactObject(Object.fromEntries(formData.entries()));
}

function setStatus(message, type = "info") {
  const node = document.getElementById("status-message");
  if (!node) return;
  node.textContent = message;
  node.classList.remove(...STATUS_CLASSES);
  node.classList.add(`status-${type}`);
}

function writeOutput(id, value) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function writeOutputHtml(id, html) {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = html;
}

function emptyState(message) {
  return `<p class=\"empty\">${escapeHtml(message)}</p>`;
}

function qualityClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "otimo") return "quality-otimo";
  if (normalized === "bom") return "quality-bom";
  if (normalized === "ainda pode, mas pouco") return "quality-moderado";
  if (normalized === "ruim") return "quality-ruim";
  if (normalized === "nunca coma") return "quality-nunca";
  return "quality-default";
}

function slugifyLevel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clinicalLabel(item) {
  if (item?.label) return item.label;
  const normalized = String(item?.level || "").toLowerCase();
  if (normalized === "emergencia") return "Emergencia";
  if (normalized === "ruim") return "Ruim";
  if (normalized === "ainda_da_para_melhorar") return "Ainda da para melhorar";
  if (normalized === "bom") return "Bom";
  if (normalized === "otimo") return "Otimo";
  return "Sem dado";
}

function markerImpactText(markerName, direction) {
  const name = normalizeMarkerName(markerName);
  const isHigh = direction === "alto";

  if (name.includes("creatinina") || name.includes("ureia") || name.includes("acido urico")) {
    return isHigh
      ? "Pode indicar sobrecarga renal e pior filtragem. Hidratacao e ajuste alimentar viram prioridade."
      : "Pode sugerir alteracao de metabolismo/proteina; vale revisar contexto clinico com medico.";
  }

  if (name.includes("tgp") || name.includes("alt") || name.includes("tgo") || name.includes("ast") || name.includes("ggt")) {
    return isHigh
      ? "Sinal de estresse no figado; excesso de ultraprocessado/alcohol pode piorar."
      : "Valor baixo isolado costuma ter menor impacto, mas exige leitura do painel completo.";
  }

  if (name.includes("ldl") || name.includes("colesterol") || name.includes("triglicer")) {
    return isHigh
      ? "Aumenta risco cardiovascular; foco em fibra, atividade fisica e corte de gordura trans."
      : "Valor baixo pode ser favoravel dependendo do marcador, mas deve ser lido com HDL e contexto.";
  }

  if (name.includes("glicose") || name.includes("glicemia") || name.includes("hba1c") || name.includes("hemoglobina glicada")) {
    return isHigh
      ? "Sugere pior controle glicemico e risco metabolico; reduzir picos de carboidrato vira prioridade."
      : "Valor baixo pede cautela com sintomas de hipoglicemia e estrategia de refeicoes.";
  }

  return "Marcador fora da faixa pode impactar desempenho, recuperacao e risco metabolico no dia a dia.";
}

function toApiDateFilter(value, mode = "from") {
  if (!value) return "";
  const raw = String(value).trim();
  if (DATE_ONLY_RE.test(raw)) {
    return mode === "to" ? `${raw}T23:59:59-03:00` : `${raw}T00:00:00-03:00`;
  }
  return raw;
}

function toComparableTimestamp(value, mode = "from") {
  const parsed = parseDateForFilterBound(value, mode);
  if (!parsed) return null;
  return parsed.getTime();
}

function hasActiveDateFilter() {
  return Boolean(state.filter.from || state.filter.to);
}

function passesCurrentDateFilter(value) {
  const current = toComparableTimestamp(value, "from");
  if (current === null) return true;

  const fromTs = toComparableTimestamp(state.filter.from, "from");
  const toTs = toComparableTimestamp(state.filter.to, "to");

  if (fromTs !== null && current < fromTs) return false;
  if (toTs !== null && current > toTs) return false;
  return true;
}

function updateFilterSummary() {
  const node = document.getElementById("filter-summary");
  if (!node) return;

  if (!state.filter.from && !state.filter.to) {
    node.textContent = "Período: sem filtro (todos os registros)";
    return;
  }

  const fromLabel = state.filter.from ? fmtDate(state.filter.from) : "início";
  const toLabel = state.filter.to ? fmtDate(state.filter.to) : "hoje";
  node.textContent = `Período aplicado: ${fromLabel} até ${toLabel}`;
}

function currentFilterParams() {
  const params = {};
  if (state.filter.from) params.from = toApiDateFilter(state.filter.from, "from");
  if (state.filter.to) params.to = toApiDateFilter(state.filter.to, "to");
  return params;
}

function queryStringFromObject(input) {
  return new URLSearchParams(compactObject(input)).toString();
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error || body?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

async function apiFormData(url, formData, options = {}) {
  const response = await fetch(url, {
    method: "POST",
    body: formData,
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error || body?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

async function ensureUser() {
  if (state.userId) return state.userId;

  const usersPayload = await apiJson("/api/users?auto_create=1");
  if (!usersPayload.users || usersPayload.users.length === 0) {
    throw new Error("Nao foi possivel encontrar/criar usuario principal");
  }

  state.userId = usersPayload.users[0].id;
  return state.userId;
}

function setupTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  function activate(tabName) {
    for (const button of buttons) {
      button.classList.toggle("is-active", button.dataset.tab === tabName);
    }

    for (const panel of panels) {
      panel.classList.toggle("is-active", panel.id === `tab-${tabName}`);
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => activate(button.dataset.tab));
  }
}

function buildReportCard(report) {
  const reportDate = fmtDate(report.report_date);
  const summary = report.summary || {};
  const hydration = summary.hydration || {};
  const nutrition = summary.nutrition || {};
  const workouts = summary.workouts || {};

  return `
    <article class="history-item report-item">
      <header>
        <strong>${escapeHtml(reportDate)}</strong>
        <span class="muted">${escapeHtml(report.period || "daily")}</span>
      </header>
      <p>Água: <strong>${fmtNumber(hydration.total_ml, 0)} ml</strong> (${fmtNumber(hydration.goal_progress_pct, 0)}%)</p>
      <p>Refeições: <strong>${fmtNumber(nutrition.total_entries, 0)}</strong></p>
      <p>Treinos: <strong>${fmtNumber(workouts.total_sessions, 0)}</strong></p>
      <p class="muted">${escapeHtml((summary.action_hints || [])[0] || "Sem recomendações.")}</p>
    </article>
  `;
}

function renderReports() {
  const container = document.getElementById("reports-list");
  if (!container) return;

  const filteredReports = (state.cache.reports || []).filter((report) =>
    passesCurrentDateFilter(report.report_date || report.created_at)
  );

  if (!filteredReports.length) {
    container.innerHTML = emptyState("Sem relatórios gerados ainda.");
    return;
  }

  container.innerHTML = filteredReports.map(buildReportCard).join("");
}

function renderMetricCards() {
  const overview = state.cache.dashboard?.overview;
  const waterNode = document.getElementById("metric-water");
  const waterSubNode = document.getElementById("metric-water-sub");
  const mealsNode = document.getElementById("metric-meals");
  const qualityNode = document.getElementById("metric-last-quality");
  const workoutsNode = document.getElementById("metric-workouts");
  const workoutMinutesNode = document.getElementById("metric-workout-minutes");

  if (!waterNode || !mealsNode || !qualityNode || !workoutsNode || !workoutMinutesNode) return;

  const filteredHydrationTotal = (state.cache.hydration || []).reduce(
    (acc, item) => acc + Number(item.amount_ml || 0),
    0
  );
  const filteredNutritionCount = (state.cache.nutrition || []).length;
  const filteredWorkoutCount = (state.cache.workouts || []).length;
  const filteredWorkoutMinutes = (state.cache.workouts || []).reduce(
    (acc, item) => acc + Number(item.duration_minutes || 0),
    0
  );
  const latestFilteredNutrition = state.cache.nutrition[0] || null;

  if (hasActiveDateFilter()) {
    waterNode.textContent = `${fmtNumber(filteredHydrationTotal, 0)} ml`;
    mealsNode.textContent = String(filteredNutritionCount);

    const quality = latestFilteredNutrition?.meal_quality || "sem registro";
    qualityNode.textContent = quality;
    qualityNode.className = `metric-sub tag ${qualityClass(quality)}`;

    workoutsNode.textContent = String(filteredWorkoutCount);
    workoutMinutesNode.textContent = `${fmtNumber(filteredWorkoutMinutes, 0)} min`;

    if (waterSubNode) {
      waterSubNode.textContent = "somatório do período filtrado";
    }
  } else {
    if (!overview) return;

    waterNode.textContent = `${fmtNumber(overview.today.hydration_total_ml, 0)} ml`;
    mealsNode.textContent = String(overview.today.nutrition_count || 0);

    const quality = overview.today.latest_nutrition?.meal_quality || "sem registro";
    qualityNode.textContent = quality;
    qualityNode.className = `metric-sub tag ${qualityClass(quality)}`;

    workoutsNode.textContent = String(overview.week.workout_sessions || 0);
    workoutMinutesNode.textContent = `${fmtNumber(overview.week.total_workout_minutes, 0)} min`;

    if (waterSubNode) {
      const hydrationGoal = Number(overview.today.hydration_goal_ml || 3000);
      waterSubNode.textContent = `meta ${fmtNumber(hydrationGoal, 0)} ml`;
    }
  }

  const latestBio =
    state.cache.bioimpedance[0] ||
    (!hasActiveDateFilter() ? state.cache.dashboard?.overview?.latest_bioimpedance || null : null);
  const clinicalInsights = overview?.clinical?.insights || [];
  const bioFatInsight = clinicalInsights.find((item) => item.id === "bio_fat") || null;

  const bioFatNode = document.getElementById("metric-bio-fat");
  const bioFatSubNode = document.getElementById("metric-bio-fat-sub");
  const bioFatIdealNode = document.getElementById("metric-bio-fat-ideal");
  const bioFatCardNode = document.getElementById("metric-card-bio-fat");

  if (bioFatNode) {
    bioFatNode.textContent = latestBio ? `${fmtNumber(latestBio.body_fat_pct)}%` : "-";
  }

  if (bioFatSubNode) {
    bioFatSubNode.textContent = bioFatInsight
      ? `${clinicalLabel(bioFatInsight)} (${bioFatInsight.score}%)`
      : "ultimo registro";
  }

  if (bioFatIdealNode) {
    bioFatIdealNode.textContent = bioFatInsight ? `ideal: ${bioFatInsight.ideal}` : "ideal: sem referencia";
  }

  if (bioFatCardNode) {
    bioFatCardNode.classList.remove(
      "metric-risk-emergencia",
      "metric-risk-ruim",
      "metric-risk-ainda-da-para-melhorar",
      "metric-risk-bom",
      "metric-risk-otimo"
    );
    if (bioFatInsight) {
      bioFatCardNode.classList.add(`metric-risk-${slugifyLevel(clinicalLabel(bioFatInsight))}`);
    }
  }

  document.getElementById("metric-bio-muscle").textContent = latestBio ? `${fmtNumber(latestBio.muscle_mass_kg)} kg` : "-";
  document.getElementById("metric-bio-water").textContent = latestBio ? `${fmtNumber(latestBio.body_water_pct)}%` : "-";
  document.getElementById("metric-bio-visceral").textContent = latestBio ? fmtNumber(latestBio.visceral_fat_level) : "-";
}

function profileCardHtml(label, value, note = "") {
  return `
    <article class="profile-card">
      <span class="profile-label">${escapeHtml(label)}</span>
      <p class="profile-value">${escapeHtml(value)}</p>
      <p class="profile-note">${escapeHtml(note || "-")}</p>
    </article>
  `;
}

function renderProfileSummary() {
  const cardsNode = document.getElementById("profile-summary-cards");
  const metaNode = document.getElementById("profile-summary-meta");
  if (!cardsNode || !metaNode) return;

  const overview = state.cache.dashboard?.overview || {};
  const profile = state.cache.profile || overview.profile || null;
  const latestMeasurement = state.cache.measurements[0] || overview.latest_measurement || null;
  const latestBio = state.cache.bioimpedance[0] || overview.latest_bioimpedance || null;

  if (!profile && !latestMeasurement && !latestBio) {
    cardsNode.innerHTML = emptyState("Preencha perfil e medidas para montar seu resumo corporal.");
    metaNode.textContent = "Sem dados de cadastro ainda.";
    return;
  }

  const heightCm = toNumberOrNull(profile?.height_cm);
  const baselineWeight = toNumberOrNull(profile?.baseline_weight_kg);
  const currentWeight = toNumberOrNull(latestMeasurement?.weight_kg);
  const currentBmi = toNumberOrNull(latestMeasurement?.bmi);
  const currentBodyFat = toNumberOrNull(latestBio?.body_fat_pct ?? latestMeasurement?.body_fat_pct);
  const currentWaist = toNumberOrNull(latestMeasurement?.waist_cm);
  const weightDelta =
    baselineWeight !== null && currentWeight !== null ? Number((currentWeight - baselineWeight).toFixed(1)) : null;

  const cards = [
    {
      label: "Altura",
      value: heightCm !== null ? `${fmtNumber(heightCm)} cm` : "-",
      note: "perfil base",
    },
    {
      label: "Peso base",
      value: baselineWeight !== null ? `${fmtNumber(baselineWeight)} kg` : "-",
      note: "cadastro",
    },
    {
      label: "Peso atual",
      value: currentWeight !== null ? `${fmtNumber(currentWeight)} kg` : "-",
      note:
        weightDelta === null
          ? "sem comparacao"
          : weightDelta > 0
            ? `+${fmtNumber(weightDelta)} kg vs base`
            : `${fmtNumber(weightDelta)} kg vs base`,
    },
    {
      label: "IMC atual",
      value: currentBmi !== null ? fmtNumber(currentBmi, 2) : "-",
      note: "ultima medicao",
    },
    {
      label: "Gordura corporal",
      value: currentBodyFat !== null ? `${fmtNumber(currentBodyFat)}%` : "-",
      note: "bioimpedancia mais recente",
    },
    {
      label: "Cintura",
      value: currentWaist !== null ? `${fmtNumber(currentWaist)} cm` : "-",
      note: "ultima medida corporal",
    },
  ];

  cardsNode.innerHTML = cards.map((item) => profileCardHtml(item.label, item.value, item.note)).join("");

  const sourceDate = latestMeasurement?.recorded_at || latestBio?.recorded_at || null;
  metaNode.textContent = sourceDate
    ? `Dados atuais baseados no registro de ${fmtDateTime(sourceDate)}.`
    : "Dados atuais baseados no seu perfil cadastrado.";
}

function renderProgressPhotos() {
  const container = document.getElementById("progress-photo-gallery");
  if (!container) return;

  const photos = (state.cache.measurements || [])
    .filter((item) => item.progress_photo_url)
    .slice(0, 12);

  if (!photos.length) {
    container.innerHTML = emptyState("Sem fotos de evolução no período. Envie uma foto no bloco de registros.");
    return;
  }

  container.innerHTML = photos.map((item) => {
    const weight = toNumberOrNull(item.weight_kg);
    const waist = toNumberOrNull(item.waist_cm);
    const captionParts = [];
    if (weight !== null) captionParts.push(`${fmtNumber(weight)} kg`);
    if (waist !== null) captionParts.push(`cintura ${fmtNumber(waist)} cm`);

    return `
      <article class="progress-photo-card">
        <img src="${escapeHtml(item.progress_photo_url)}" alt="Foto de evolução em ${escapeHtml(fmtDate(item.recorded_at))}" loading="lazy" />
        <p class="progress-photo-caption"><strong>${escapeHtml(fmtDate(item.recorded_at))}</strong></p>
        <p class="progress-photo-caption">${escapeHtml(captionParts.join(" | ") || "Sem medidas associadas")}</p>
      </article>
    `;
  }).join("");
}

function renderHistoryList(containerId, items, toHtml) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = emptyState("Sem registros ainda.");
    return;
  }

  container.innerHTML = items.map(toHtml).join("");
}

function extractFoodItems(entry) {
  const fromPayload = entry?.ai_payload?.food_items;
  if (Array.isArray(fromPayload) && fromPayload.length > 0) {
    return fromPayload
      .map((item) => ({
        food_name: item.food_name || "Item",
        portion: item.portion || "porção não informada",
        quality: item.quality || entry.meal_quality || "bom",
        reason: item.reason || "sem observação",
      }))
      .slice(0, 8);
  }

  const rawText = String(entry?.raw_input_text || "")
    .replace(/^.+?:\s*/i, "")
    .trim();
  if (rawText) {
    const inferredItems = rawText
      .split(/[,\n;]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((item) => ({
        food_name: item,
        portion: "não estimada",
        quality: entry.meal_quality || "bom",
        reason: "Item inferido do texto informado (sem análise granular da IA).",
      }));

    if (inferredItems.length) return inferredItems;
  }

  if (entry.analyzed_summary) {
    return [
      {
        food_name: "Resumo da refeição",
        portion: "geral",
        quality: entry.meal_quality || "bom",
        reason: entry.analyzed_summary,
      },
    ];
  }

  return [];
}

function isLikelyClinicalText(value) {
  const normalized = normalizeMarkerName(value || "");
  if (!normalized) return false;
  return [
    "exame",
    "creatinina",
    "ureia",
    "colesterol",
    "hemoglobina glicada",
    "hba1c",
    "glicose",
    "glicemia",
    "nefro",
    "cardio",
  ].some((term) => normalized.includes(term));
}

function mealTextPreview(entry) {
  const base = String(entry?.raw_input_text || entry?.analyzed_summary || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!base) return "Refeição registrada";
  if (base.length <= 130) return base;
  return `${base.slice(0, 127)}...`;
}

function mealSlotLabel(slot) {
  return MEAL_SLOTS.find((item) => item.key === slot)?.label || "Outro";
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

function resolveMealSlot(entry) {
  const slotFromPayload = entry?.ai_payload?.meal_slot;
  if (slotFromPayload && MEAL_SLOTS.some((item) => item.key === slotFromPayload)) {
    return slotFromPayload;
  }

  const slotFromText = inferMealSlotByText(entry.raw_input_text || entry.analyzed_summary);
  if (slotFromText) return slotFromText;

  return inferMealSlotByTime(entry.recorded_at);
}

function buildMealSlotsData(entries) {
  const grouped = Object.fromEntries(MEAL_SLOTS.map((slot) => [slot.key, []]));

  for (const entry of entries || []) {
    const slot = resolveMealSlot(entry);
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot].push(entry);
  }

  return grouped;
}

function examAlertsFromMarkers(markers, limit = 3) {
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

  return alerts.slice(0, limit);
}

function signalClassByRatio(ratio, goodThreshold = 1, attentionThreshold = 0.7) {
  if (ratio >= goodThreshold) return "signal-good";
  if (ratio >= attentionThreshold) return "signal-attention";
  return "signal-alert";
}

const NUTRITION_QUALITY_ORDER = ["nunca coma", "ruim", "ainda pode, mas pouco", "bom", "otimo"];

function normalizeNutritionQuality(value) {
  const normalized = String(value || "").toLowerCase().trim();
  return NUTRITION_QUALITY_ORDER.includes(normalized) ? normalized : "bom";
}

function pickWorseQuality(left, right) {
  const leftQuality = normalizeNutritionQuality(left);
  const rightQuality = normalizeNutritionQuality(right);
  return NUTRITION_QUALITY_ORDER.indexOf(leftQuality) <= NUTRITION_QUALITY_ORDER.indexOf(rightQuality)
    ? leftQuality
    : rightQuality;
}

function mergeTextUnique(a, b, separator = " | ") {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left) return right;
  if (!right) return left;
  if (left.toLowerCase() === right.toLowerCase()) return left;
  return `${left}${separator}${right}`;
}

function sumNullableNumbers(a, b, digits = 1) {
  const left = toNumberOrNull(a);
  const right = toNumberOrNull(b);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return Number((left + right).toFixed(digits));
}

function maxNullableNumbers(a, b) {
  const left = toNumberOrNull(a);
  const right = toNumberOrNull(b);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function normalizeFoodItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      food_name: String(item?.food_name || "Item").trim(),
      portion: String(item?.portion || "porção não informada").trim(),
      quality: normalizeNutritionQuality(item?.quality || "bom"),
      reason: String(item?.reason || "sem observação").trim(),
    }))
    .filter((item) => item.food_name)
    .slice(0, 20);
}

function mergeFoodItems(baseItems, nextItems) {
  const merged = [...normalizeFoodItems(baseItems)];
  const seen = new Set(
    merged.map((item) => `${item.food_name.toLowerCase()}::${item.portion.toLowerCase()}`)
  );

  for (const item of normalizeFoodItems(nextItems)) {
    const key = `${item.food_name.toLowerCase()}::${item.portion.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, 30);
}

function normalizeAnalysisPayload(payload) {
  const analysis = payload?.analysis && typeof payload.analysis === "object" ? payload.analysis : payload || {};
  const mealSlot = MEAL_SLOTS.some((item) => item.key === analysis.meal_slot) ? analysis.meal_slot : "outro";

  return {
    meal_slot: mealSlot,
    summary: String(analysis.summary || "").trim(),
    quality: normalizeNutritionQuality(payload?.quality || analysis.quality || "bom"),
    impact: String(analysis.impact || "").trim(),
    action_now: String(analysis.action_now || "").trim(),
    next_step: String(analysis.next_step || "").trim(),
    hydration_tip: String(analysis.hydration_tip || "").trim(),
    water_intake_ml: toNumberOrNull(analysis.water_intake_ml),
    water_recommended_ml: toNumberOrNull(analysis.water_recommended_ml),
    estimated_calories: toNumberOrNull(analysis.estimated_calories),
    protein_g: toNumberOrNull(analysis.protein_g),
    carbs_g: toNumberOrNull(analysis.carbs_g),
    fat_g: toNumberOrNull(analysis.fat_g),
    food_items: normalizeFoodItems(analysis.food_items),
  };
}

function mergeNutritionAnalysis(base, next) {
  const left = normalizeAnalysisPayload(base);
  const right = normalizeAnalysisPayload(next);
  const nextMealSlot = right.meal_slot !== "outro" ? right.meal_slot : left.meal_slot;

  return {
    meal_slot: nextMealSlot || "outro",
    summary: mergeTextUnique(left.summary, right.summary),
    quality: pickWorseQuality(left.quality, right.quality),
    impact: mergeTextUnique(left.impact, right.impact),
    action_now: mergeTextUnique(left.action_now, right.action_now),
    next_step: mergeTextUnique(left.next_step, right.next_step),
    hydration_tip: mergeTextUnique(left.hydration_tip, right.hydration_tip),
    water_intake_ml: sumNullableNumbers(left.water_intake_ml, right.water_intake_ml, 0),
    water_recommended_ml: maxNullableNumbers(left.water_recommended_ml, right.water_recommended_ml),
    estimated_calories: sumNullableNumbers(left.estimated_calories, right.estimated_calories, 0),
    protein_g: sumNullableNumbers(left.protein_g, right.protein_g, 1),
    carbs_g: sumNullableNumbers(left.carbs_g, right.carbs_g, 1),
    fat_g: sumNullableNumbers(left.fat_g, right.fat_g, 1),
    food_items: mergeFoodItems(left.food_items, right.food_items),
  };
}

function buildNutritionAnalysisHtml(payload, { title = "Análise nutricional", subtitle = "" } = {}) {
  const normalized = normalizeAnalysisPayload(payload);
  const foodItems = normalized.food_items;

  const headerSubtitle = subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : "";
  const mealLabel = mealSlotLabel(normalized.meal_slot);

  const itemsHtml = foodItems.length
    ? `
      <div class="analysis-food-list">
        ${foodItems
          .map(
            (item) => `
          <article class="analysis-food-item">
            <p><strong>${escapeHtml(item.food_name)}</strong> <span class="tag ${qualityClass(item.quality)}">${escapeHtml(item.quality)}</span></p>
            <p class="muted">Porção: ${escapeHtml(item.portion)}</p>
            <p class="muted">${escapeHtml(item.reason)}</p>
          </article>
        `
          )
          .join("")}
      </div>
    `
    : `<p class="muted">Sem itens detalhados nesta análise.</p>`;

  return `
    <article class="analysis-card">
      <h4>${escapeHtml(title)}</h4>
      ${headerSubtitle}
      <div class="analysis-row">
        <span class="tag ${qualityClass(normalized.quality)}">${escapeHtml(normalized.quality)}</span>
        <span class="tag quality-default">${escapeHtml(mealLabel)}</span>
      </div>
      <p><strong>Resumo geral:</strong> ${escapeHtml(normalized.summary || "sem resumo")}</p>
      <div class="analysis-row">
        <p><strong>Água detectada:</strong> ${fmtNumber(normalized.water_intake_ml, 0)} ml</p>
        <p><strong>Meta sugerida:</strong> ${fmtNumber(normalized.water_recommended_ml, 0)} ml</p>
      </div>
      <p><strong>Macros estimadas:</strong> ${fmtNumber(normalized.estimated_calories, 0)} kcal | P ${fmtNumber(normalized.protein_g)}g | C ${fmtNumber(normalized.carbs_g)}g | G ${fmtNumber(normalized.fat_g)}g</p>
      <div>
        <p><strong>Itens analisados:</strong></p>
        ${itemsHtml}
      </div>
      <div class="analysis-action">
        <p><strong>Ação de ajuste agora:</strong> ${escapeHtml(normalized.action_now || "-")}</p>
        <p><strong>Próximo passo:</strong> ${escapeHtml(normalized.next_step || "-")}</p>
      </div>
    </article>
  `;
}

function setNutritionDraftFromAnalysis(resultPayload, sourceLabel = "texto") {
  const normalized = normalizeAnalysisPayload(resultPayload);
  const rawInput = String(resultPayload?.rawInputText || "").trim();
  const draftPiece = {
    analysis: normalized,
    inputType: resultPayload?.inputType || "manual",
    modelUsed: resultPayload?.modelUsed || null,
    rawResponse: resultPayload?.rawResponse || null,
    rawInputs: rawInput ? [rawInput] : [],
    sources: [sourceLabel],
  };

  if (!state.nutritionDraft) {
    state.nutritionDraft = draftPiece;
    return;
  }

  state.nutritionDraft = {
    analysis: mergeNutritionAnalysis(state.nutritionDraft.analysis, draftPiece.analysis),
    inputType: draftPiece.inputType || state.nutritionDraft.inputType || "manual",
    modelUsed: draftPiece.modelUsed || state.nutritionDraft.modelUsed || null,
    rawResponse: draftPiece.rawResponse || state.nutritionDraft.rawResponse || null,
    rawInputs: [...(state.nutritionDraft.rawInputs || []), ...draftPiece.rawInputs].slice(-20),
    sources: [...(state.nutritionDraft.sources || []), ...draftPiece.sources].slice(-20),
  };
}

function clearNutritionDraft() {
  state.nutritionDraft = null;
}

function renderNutritionDraftPreview() {
  const node = document.getElementById("nutrition-draft-preview");
  const slotSelect = document.querySelector("#nutrition-draft-form select[name='meal_slot']");
  if (!node) return;

  if (!state.nutritionDraft) {
    node.textContent = "Sem rascunho ativo.";
    if (slotSelect) slotSelect.value = "";
    return;
  }

  const draft = state.nutritionDraft;
  const sourcesSummary = (draft.sources || []).join(" + ");
  writeOutputHtml(
    "nutrition-draft-preview",
    buildNutritionAnalysisHtml(
      { analysis: draft.analysis },
      {
        title: "Rascunho pronto para revisão",
        subtitle: `Classificação e macros representam o total atual do rascunho (${sourcesSummary || "entrada única"}).`,
      }
    )
  );

  if (slotSelect && !slotSelect.value && draft.analysis?.meal_slot && draft.analysis.meal_slot !== "outro") {
    slotSelect.value = draft.analysis.meal_slot;
  }
}

function renderDailyComparison() {
  const container = document.getElementById("daily-comparison");
  if (!container) return;

  const overview = state.cache.dashboard?.overview || {};
  const hydrationGoal = Number(overview?.today?.hydration_goal_ml || 3000);
  const hydrationTotal = (state.cache.hydration || []).reduce((acc, item) => acc + Number(item.amount_ml || 0), 0);
  const nutritionCount = (state.cache.nutrition || []).length;
  const workoutSessions = state.cache.workouts || [];
  const workoutMinutes = workoutSessions.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0);
  const latestQuality =
    state.cache.nutrition[0]?.meal_quality || overview?.today?.latest_nutrition?.meal_quality || "sem registro";

  const waterRatio = hydrationGoal > 0 ? hydrationTotal / hydrationGoal : 0;
  const mealsRatio = Math.min(1, nutritionCount / 4);
  const workoutRatio = Math.min(1, workoutMinutes / 30);

  const latestExam = (state.cache.exams || [])[0] || null;
  const examAlerts = examAlertsFromMarkers(latestExam?.markers, 3);
  const latestHints = overview?.latest_reports?.[0]?.summary?.action_hints || [];

  container.innerHTML = `
    <article class="comparison-card">
      <h4>Seu dia registrado</h4>
      <p><span class="signal ${signalClassByRatio(waterRatio)}">Água</span> ${fmtNumber(hydrationTotal, 0)} / ${fmtNumber(hydrationGoal, 0)} ml</p>
      <p><span class="signal ${signalClassByRatio(mealsRatio)}">Refeições</span> ${nutritionCount} registradas (${escapeHtml(latestQuality)})</p>
      <p><span class="signal ${signalClassByRatio(workoutRatio)}">Exercício</span> ${workoutSessions.length} sessão(ões), ${fmtNumber(workoutMinutes, 0)} min</p>
      <p class="muted">Período atual: ${fmtDate(state.filter.from)} até ${fmtDate(state.filter.to)}</p>
    </article>
    <article class="comparison-card">
      <h4>Ideal para hoje</h4>
      <p>Água alvo: <strong>${fmtNumber(hydrationGoal, 0)} ml</strong> (distribuir durante o dia)</p>
      <p>Refeições-alvo: <strong>4 a 6</strong> com proteína em cada uma</p>
      <p>Treino-alvo: <strong>1 sessão</strong> de 30 a 60 min</p>
      <p class="muted">Ajustes rápidos: ${(latestHints[0] && escapeHtml(latestHints[0])) || "seguir consistência diária"}</p>
      ${
        examAlerts.length
          ? `<p class="muted">Exame recente: ${examAlerts.map((item) => escapeHtml(item)).join(" | ")}</p>`
          : ""
      }
    </article>
  `;
}

function renderClinicalOverview() {
  const overallNode = document.getElementById("clinical-overall-banner");
  const cardsNode = document.getElementById("clinical-overview-cards");
  if (!overallNode || !cardsNode) return;

  const clinical = state.cache.dashboard?.overview?.clinical || null;
  if (!clinical || !Array.isArray(clinical.insights) || !clinical.insights.length) {
    overallNode.innerHTML = `<p class="muted">Sem dados suficientes para gerar a visao clinica.</p>`;
    cardsNode.innerHTML = emptyState("Envie exames e bioimpedancia para montar o painel completo.");
    return;
  }

  const overallLabel = clinical.overall_label || clinicalLabel({ level: clinical.overall_level });
  const highlights = Array.isArray(clinical.highlights) ? clinical.highlights : [];

  overallNode.innerHTML = `
    <h4>Placar geral: ${escapeHtml(overallLabel)} (${fmtNumber(clinical.overall_score, 0)}%)</h4>
    <p class="muted">Atualizado em ${fmtDateTime(clinical.generated_at)}</p>
    <p>${highlights.length ? escapeHtml(highlights.join(" | ")) : "Sem alertas prioritarios no momento."}</p>
  `;

  cardsNode.innerHTML = clinical.insights.map((item) => {
    const label = clinicalLabel(item);
    const levelClass = slugifyLevel(label);
    return `
      <article class="clinical-card">
        <header>
          <h4>${escapeHtml(item.title || "Saude")}</h4>
          <span class="level-badge level-${levelClass}">${escapeHtml(label)}</span>
        </header>
        <p><strong>Atual:</strong> ${escapeHtml(item.current || "sem dado")}</p>
        <p><strong>Ideal:</strong> ${escapeHtml(item.ideal || "na faixa de referencia")}</p>
      </article>
    `;
  }).join("");
}

function renderWorkoutInsights() {
  const container = document.getElementById("workout-insights");
  if (!container) return;

  const workouts = state.cache.workouts || [];
  if (!workouts.length) {
    container.innerHTML = emptyState("Sem treinos no período. Dica: registre até caminhadas leves.");
    return;
  }

  const totalMinutes = workouts.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0);
  const totalCalories = workouts.reduce((acc, item) => acc + Number(item.calories_burned_est || 0), 0);
  const byType = new Map();

  for (const workout of workouts) {
    const key = workout.activity_type || "Treino";
    const current = byType.get(key) || { sessions: 0, minutes: 0 };
    current.sessions += 1;
    current.minutes += Number(workout.duration_minutes || 0);
    byType.set(key, current);
  }

  const topTypes = [...byType.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 3)
    .map(([activity, data]) => `${activity}: ${data.sessions}x (${fmtNumber(data.minutes, 0)} min)`)
    .join(" | ");

  const latestList = workouts.slice(0, 4).map((item) => `
    <article class="history-item">
      <header><strong>${escapeHtml(item.activity_type || "Treino")}</strong></header>
      <p>${fmtNumber(item.duration_minutes, 0)} min | Intensidade: ${escapeHtml(item.intensity || "-")}</p>
      <p class="muted">${fmtDateTime(item.started_at || item.created_at)}</p>
    </article>
  `).join("");

  container.innerHTML = `
    <article class="history-item">
      <p><strong>Total:</strong> ${workouts.length} sessão(ões), ${fmtNumber(totalMinutes, 0)} min, ${fmtNumber(totalCalories, 0)} kcal estimadas</p>
      <p class="muted"><strong>Atividades principais:</strong> ${escapeHtml(topTypes || "-")}</p>
    </article>
    ${latestList}
  `;
}

function renderNutritionDashboard() {
  const mealsContainer = document.getElementById("nutrition-slot-cards");
  const detailsContainer = document.getElementById("nutrition-details-list");
  if (!mealsContainer || !detailsContainer) return;

  const nutritionEntries = state.cache.nutrition || [];
  const grouped = buildMealSlotsData(nutritionEntries);

  document.getElementById("nutrition-total-entries").textContent = String(nutritionEntries.length || 0);

  const hydrationTotal = (state.cache.hydration || []).reduce((acc, item) => acc + Number(item.amount_ml || 0), 0);
  document.getElementById("nutrition-water-total").textContent = `${fmtNumber(hydrationTotal, 0)} ml`;

  const workoutSessions = state.cache.workouts || [];
  const workoutMinutes = workoutSessions.reduce((acc, item) => acc + Number(item.duration_minutes || 0), 0);
  document.getElementById("nutrition-workouts-total").textContent = String(workoutSessions.length || 0);
  document.getElementById("nutrition-workouts-minutes").textContent = `${fmtNumber(workoutMinutes, 0)} min`;

  mealsContainer.innerHTML = MEAL_SLOTS_CORE.map((slot) => {
    const entries = grouped[slot.key] || [];
    const latest = entries[0];
    const latestQuality = latest?.meal_quality || "sem registro";

    return `
      <article class="meal-card">
        <h4>${slot.label}</h4>
        <p><strong>${entries.length}</strong> registro(s)</p>
        <p class="tag ${qualityClass(latestQuality)}">${escapeHtml(latestQuality)}</p>
        <p class="muted">Último: ${latest ? fmtDateTime(latest.recorded_at) : "-"}</p>
      </article>
    `;
  }).join("");

  const mealEntries = nutritionEntries.filter((entry) => {
    const slot = resolveMealSlot(entry);
    const isMealSlot = MEAL_SLOTS_CORE.some((item) => item.key === slot);
    if (!isMealSlot) return false;
    return !isLikelyClinicalText(entry.raw_input_text || entry.analyzed_summary);
  });

  if (!mealEntries.length) {
    const message = nutritionEntries.length
      ? "Há registros no período, mas nenhum foi identificado como refeição detalhável. Envie alimento por texto, foto ou áudio."
      : "Sem registros alimentares no período filtrado.";
    detailsContainer.innerHTML = emptyState(message);
    return;
  }

  const groupedBySlot = Object.fromEntries(MEAL_SLOTS_CORE.map((slot) => [slot.key, []]));
  for (const entry of mealEntries) {
    const slot = resolveMealSlot(entry);
    if (!groupedBySlot[slot]) continue;
    groupedBySlot[slot].push(entry);
  }

  detailsContainer.innerHTML = MEAL_SLOTS_CORE.map((slot) => {
    const entries = groupedBySlot[slot.key] || [];
    const detailedEntries = entries.slice(0, 6).map((entry) => {
      const quality = entry.meal_quality || "sem registro";
      const foodItems = extractFoodItems(entry);
      const summary = entry.analyzed_summary || mealTextPreview(entry);

      const foodDetails = foodItems.length
        ? `
          <div class="nutrition-food-list">
            ${foodItems.map((food) => `
              <article class="nutrition-food-item">
                <p>
                  <strong>${escapeHtml(food.food_name)}</strong>
                  <span class="tag ${qualityClass(food.quality)}">${escapeHtml(food.quality)}</span>
                </p>
                <p class="nutrition-food-meta">Porção: ${escapeHtml(food.portion || "não informada")}</p>
                <p class="nutrition-food-meta">${escapeHtml(food.reason || "sem observação")}</p>
              </article>
            `).join("")}
          </div>
        `
        : `<p class="muted">Sem itens detalhados nesta refeição.</p>`;

      return `
        <article class="nutrition-entry-card">
          <header class="nutrition-entry-header">
            <strong>${fmtDateTime(entry.recorded_at)}</strong>
            <span class="tag ${qualityClass(quality)}">${escapeHtml(quality)}</span>
          </header>
          <p class="nutrition-entry-text">${escapeHtml(summary)}</p>
          ${foodDetails}
          ${
            entry.recommended_action
              ? `<p class="nutrition-food-meta"><strong>Ação:</strong> ${escapeHtml(entry.recommended_action)}</p>`
              : ""
          }
        </article>
      `;
    }).join("");

    return `
      <article class="history-item">
        <header>
          <strong>${slot.label}</strong>
          <span class="tag quality-default">${entries.length} registro(s)</span>
        </header>
        ${entries.length ? detailedEntries : `<p class="muted">Sem registro neste período.</p>`}
      </article>
    `;
  }).join("");
}

function renderHistories() {
  renderHistoryList("history-measurements", state.cache.measurements, (item) => `
    <article class="history-item">
      <header><strong>${fmtDateTime(item.recorded_at)}</strong></header>
      <p>Peso: <strong>${fmtNumber(item.weight_kg)} kg</strong> | IMC: ${fmtNumber(item.bmi, 2)}</p>
      <p>Gordura: ${fmtNumber(item.body_fat_pct)}% | Cintura: ${fmtNumber(item.waist_cm)} cm</p>
      ${
        item.progress_photo_url
          ? `<p><a class="file-link" href="${escapeHtml(item.progress_photo_url)}" target="_blank" rel="noreferrer">Abrir foto de evolução</a></p>`
          : ""
      }
      <p class="muted">${escapeHtml(item.notes || "-")}</p>
    </article>
  `);

  renderHistoryList("history-bioimpedance", state.cache.bioimpedance, (item) => `
    <article class="history-item">
      <header><strong>${fmtDateTime(item.recorded_at)}</strong></header>
      <p>Gordura: <strong>${fmtNumber(item.body_fat_pct)}%</strong> | Muscular: ${fmtNumber(item.muscle_mass_kg)} kg</p>
      <p>Água: ${fmtNumber(item.body_water_pct)}% | BMR: ${fmtNumber(item.bmr_kcal, 0)} kcal | Visceral: ${fmtNumber(item.visceral_fat_level)}</p>
      <p class="muted">${escapeHtml(item.notes || "-")}</p>
    </article>
  `);

  renderHistoryList("history-exams", state.cache.exams, (item) => {
    const markersJson = JSON.stringify(item.markers || {}, null, 2);
    const fileLink = item.file_url
      ? `<a class="file-link" href="${escapeHtml(item.file_url)}" target="_blank" rel="noreferrer">Abrir anexo</a>`
      : "<span class=\"muted\">Sem anexo</span>";

    return `
      <article class="history-item">
        <header><strong>${escapeHtml(item.exam_name || "Exame")}</strong></header>
        <p>Data: ${fmtDate(item.exam_date || item.created_at)} | Tipo: ${escapeHtml(item.exam_type || "-")}</p>
        <details>
          <summary>Marcadores</summary>
          <pre>${escapeHtml(markersJson)}</pre>
        </details>
        <p>${fileLink}</p>
        <p class="muted">${escapeHtml(item.notes || "-")}</p>
      </article>
    `;
  });

  renderHistoryList("history-hydration", state.cache.hydration, (item) => `
    <article class="history-item">
      <header><strong>${fmtDateTime(item.recorded_at)}</strong></header>
      <p>${fmtNumber(item.amount_ml, 0)} ml</p>
      <p class="muted">${escapeHtml(item.notes || "-")}</p>
    </article>
  `);

  renderHistoryList("history-workouts", state.cache.workouts, (item) => `
    <article class="history-item">
      <header><strong>${escapeHtml(item.activity_type || "Treino")}</strong></header>
      <p>${fmtNumber(item.duration_minutes, 0)} min | Intensidade: ${escapeHtml(item.intensity || "-")}</p>
      <p>Inicio: ${fmtDateTime(item.started_at || item.created_at)}</p>
      <p class="muted">${escapeHtml(item.notes || "-")}</p>
    </article>
  `);

  renderHistoryList("history-nutrition", state.cache.nutrition, (item) => `
    <article class="history-item">
      <header>
        <strong>${fmtDateTime(item.recorded_at)}</strong>
        <span class="tag ${qualityClass(item.meal_quality)}">${escapeHtml(item.meal_quality || "-")}</span>
      </header>
      <p>${escapeHtml(item.analyzed_summary || "Sem resumo")}</p>
      <p class="muted">Calorias: ${fmtNumber(item.estimated_calories, 0)} | Proteína: ${fmtNumber(item.estimated_protein_g)} g</p>
    </article>
  `);
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
    if (
      aliases.some((alias) => {
        const normalizedAlias = normalizeMarkerName(alias);
        if (normalizedAlias.length <= 3) {
          return tokens.includes(normalizedAlias);
        }
        return normalized.includes(normalizedAlias);
      })
    ) {
      return { name, payload };
    }
  }
  return null;
}

function markerFlagTag(flag) {
  const normalized = String(flag || "").toLowerCase();
  if (normalized === "high") return '<span class="signal signal-alert">alto</span>';
  if (normalized === "low") return '<span class="signal signal-attention">baixo</span>';
  return '<span class="signal signal-good">ok</span>';
}

function renderExamPanel() {
  const kpiContainer = document.getElementById("exam-kpi-cards");
  const alertsContainer = document.getElementById("exam-alerts-list");
  const timelineContainer = document.getElementById("exam-timeline-list");
  if (!kpiContainer || !alertsContainer || !timelineContainer) return;

  const exams = state.cache.exams || [];
  if (!exams.length) {
    kpiContainer.innerHTML = emptyState("Sem exames no período filtrado.");
    alertsContainer.innerHTML = emptyState("Sem alertas para exibir.");
    timelineContainer.innerHTML = emptyState("Sem linha do tempo de exames.");
    return;
  }

  const latestWithMarkers = exams.find((exam) => exam.markers && Object.keys(exam.markers).length > 0) || exams[0];
  const markers = latestWithMarkers?.markers || {};

  const kpiDefs = [
    { title: "Creatinina", aliases: ["creatinina"] },
    { title: "Ureia", aliases: ["ureia", "urea"] },
    { title: "TGO / AST", aliases: ["tgo", "ast"] },
    { title: "TGP / ALT", aliases: ["tgp", "alt"] },
    { title: "GGT", aliases: ["ggt", "gama gt", "gama glutamil"] },
    { title: "LDL", aliases: ["ldl"] },
    { title: "Glicose jejum", aliases: ["glicose de jejum", "glicemia de jejum", "glicose jejum"] },
    { title: "HbA1c", aliases: ["hemoglobina glicada", "hba1c"] },
  ];

  kpiContainer.innerHTML = kpiDefs.map((item) => {
    const found = findMarkerByAliases(markers, item.aliases);
    if (!found) {
      return `
        <article class="exam-kpi-card">
          <h4>${item.title}</h4>
          <p class="exam-kpi-value">sem dado</p>
          <span class="muted">envie exame com esse marcador</span>
        </article>
      `;
    }

    const value = found.payload?.value ?? "n/d";
    const unit = found.payload?.unit ? ` ${found.payload.unit}` : "";
    const refRange = found.payload?.reference_range || "faixa de referência não informada";

    return `
      <article class="exam-kpi-card">
        <h4>${item.title}</h4>
        <p class="exam-kpi-value">${escapeHtml(String(value))}${escapeHtml(unit)}</p>
        ${markerFlagTag(found.payload?.flag)}
        <span class="muted">${escapeHtml(refRange)}</span>
      </article>
    `;
  }).join("");

  const markerAlerts = Object.entries(markers)
    .filter(([, payload]) => {
      const flag = String(payload?.flag || "").toLowerCase();
      return flag === "high" || flag === "low";
    })
    .slice(0, 8);

  if (!markerAlerts.length) {
    alertsContainer.innerHTML = `
      <article class="history-item">
        <p><strong>Sem alertas críticos</strong> no exame mais recente.</p>
        <p class="muted">Exame base: ${escapeHtml(latestWithMarkers.exam_name || "Exame")} (${fmtDate(latestWithMarkers.exam_date || latestWithMarkers.created_at)})</p>
      </article>
    `;
  } else {
    alertsContainer.innerHTML = markerAlerts.map(([name, payload]) => {
      const direction = String(payload?.flag || "").toLowerCase() === "high" ? "alto" : "baixo";
      const value = payload?.value ?? "n/d";
      const unit = payload?.unit ? ` ${payload.unit}` : "";
      const impact = markerImpactText(name, direction);
      return `
        <article class="history-item">
          <header>
            <strong>${escapeHtml(name)}</strong>
            ${markerFlagTag(payload?.flag)}
          </header>
          <p>Valor: <strong>${escapeHtml(String(value))}${escapeHtml(unit)}</strong> (${direction})</p>
          <p class="muted">${escapeHtml(payload?.reference_range || "Faixa de referência não informada")}</p>
          <p class="impact-line"><strong>Impacto:</strong> ${escapeHtml(impact)}</p>
        </article>
      `;
    }).join("");
  }

  timelineContainer.innerHTML = exams.map((exam) => {
    const markersCount = Object.keys(exam.markers || {}).length;
    const fileLink = exam.file_url
      ? `<a class="file-link" href="${escapeHtml(exam.file_url)}" target="_blank" rel="noreferrer">Abrir anexo</a>`
      : "<span class=\"muted\">Sem anexo</span>";

    return `
      <article class="history-item">
        <header>
          <strong>${escapeHtml(exam.exam_name || "Exame")}</strong>
          <span class="muted">${fmtDate(exam.exam_date || exam.created_at)}</span>
        </header>
        <p>Tipo: ${escapeHtml(exam.exam_type || "-")} | Marcadores: ${markersCount}</p>
        <p>${fileLink}</p>
      </article>
    `;
  }).join("");
}

function getChartContext(id) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof window.Chart === "undefined") return null;
  return canvas.getContext("2d");
}

function upsertChart(name, canvasId, config) {
  const ctx = getChartContext(canvasId);
  if (!ctx) return;

  if (state.charts[name]) {
    state.charts[name].destroy();
  }

  state.charts[name] = new window.Chart(ctx, config);
}

function sortAscByDate(items, key) {
  return [...(items || [])].sort((a, b) => new Date(a[key]).getTime() - new Date(b[key]).getTime());
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 120,
    animation: false,
    plugins: { legend: { display: false } },
  };
}

function renderWeightChart() {
  const points = sortAscByDate(state.cache.measurements, "recorded_at")
    .filter((item) => item.weight_kg !== null && item.weight_kg !== undefined)
    .slice(-30);

  upsertChart("weight", "chart-weight", {
    type: "line",
    data: {
      labels: points.map((item) => fmtDate(item.recorded_at)),
      datasets: [
        {
          label: "Peso (kg)",
          data: points.map((item) => Number(item.weight_kg)),
          borderColor: "#d35f2f",
          backgroundColor: "rgba(211,95,47,0.2)",
          tension: 0.22,
          pointRadius: 3,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
    },
  });
}

function renderFatChart() {
  const points = sortAscByDate(state.cache.bioimpedance, "recorded_at")
    .filter((item) => {
      const fat = toNumberOrNull(item.body_fat_pct);
      const water = toNumberOrNull(item.body_water_pct);
      const muscle = toNumberOrNull(item.muscle_mass_kg);
      return fat !== null || water !== null || muscle !== null;
    })
    .slice(-30);

  upsertChart("fat", "chart-fat", {
    type: "line",
    data: {
      labels: points.map((item) => fmtDate(item.recorded_at)),
      datasets: [
        {
          label: "Gordura (%)",
          data: points.map((item) => toNumberOrNull(item.body_fat_pct)),
          borderColor: "#2f8f83",
          backgroundColor: "rgba(47,143,131,0.22)",
          tension: 0.25,
          pointRadius: 3,
          yAxisID: "yPct",
          spanGaps: true,
        },
        {
          label: "Água corporal (%)",
          data: points.map((item) => toNumberOrNull(item.body_water_pct)),
          borderColor: "#267cb7",
          backgroundColor: "rgba(38,124,183,0.2)",
          tension: 0.25,
          pointRadius: 3,
          yAxisID: "yPct",
          spanGaps: true,
        },
        {
          label: "Massa muscular (kg)",
          data: points.map((item) => toNumberOrNull(item.muscle_mass_kg)),
          borderColor: "#d35f2f",
          backgroundColor: "rgba(211,95,47,0.18)",
          tension: 0.2,
          pointRadius: 3,
          yAxisID: "yKg",
          spanGaps: true,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: 12,
            usePointStyle: true,
          },
        },
      },
      scales: {
        yPct: {
          type: "linear",
          position: "left",
          suggestedMin: 0,
          suggestedMax: 100,
          title: {
            display: true,
            text: "%",
          },
        },
        yKg: {
          type: "linear",
          position: "right",
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: "kg",
          },
        },
      },
    },
  });
}

function renderHydrationChart() {
  const points = sortAscByDate(state.cache.hydration, "recorded_at").slice(-25);

  upsertChart("hydration", "chart-hydration", {
    type: "bar",
    data: {
      labels: points.map((item) => fmtDateTime(item.recorded_at)),
      datasets: [
        {
          label: "Hidratação (ml)",
          data: points.map((item) => Number(item.amount_ml || 0)),
          backgroundColor: "rgba(38, 124, 183, 0.45)",
          borderColor: "#267cb7",
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
    },
  });
}

function renderBodyMeasurementsChart() {
  const points = sortAscByDate(state.cache.measurements, "recorded_at")
    .filter((item) => {
      const waist = toNumberOrNull(item.waist_cm);
      const abdomen = toNumberOrNull(item.abdomen_cm);
      const hip = toNumberOrNull(item.hip_cm);
      const thigh = toNumberOrNull(item.thigh_cm);
      return waist !== null || abdomen !== null || hip !== null || thigh !== null;
    })
    .slice(-40);

  upsertChart("measurements", "chart-measurements", {
    type: "line",
    data: {
      labels: points.map((item) => fmtDate(item.recorded_at)),
      datasets: [
        {
          label: "Cintura (cm)",
          data: points.map((item) => toNumberOrNull(item.waist_cm)),
          borderColor: "#2f8f83",
          backgroundColor: "rgba(47,143,131,0.18)",
          tension: 0.24,
          pointRadius: 3,
          spanGaps: true,
        },
        {
          label: "Abdômen (cm)",
          data: points.map((item) => toNumberOrNull(item.abdomen_cm)),
          borderColor: "#267cb7",
          backgroundColor: "rgba(38,124,183,0.18)",
          tension: 0.24,
          pointRadius: 3,
          spanGaps: true,
        },
        {
          label: "Quadril (cm)",
          data: points.map((item) => toNumberOrNull(item.hip_cm)),
          borderColor: "#d35f2f",
          backgroundColor: "rgba(211,95,47,0.18)",
          tension: 0.24,
          pointRadius: 3,
          spanGaps: true,
        },
        {
          label: "Coxa (cm)",
          data: points.map((item) => toNumberOrNull(item.thigh_cm)),
          borderColor: "#5e7f32",
          backgroundColor: "rgba(94,127,50,0.16)",
          tension: 0.24,
          pointRadius: 3,
          spanGaps: true,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: 12,
            usePointStyle: true,
          },
        },
      },
    },
  });
}

function renderCharts() {
  renderWeightChart();
  renderFatChart();
  renderHydrationChart();
  renderBodyMeasurementsChart();
}

async function loadTelegramWebhookInfo() {
  try {
    const payload = await apiJson("/api/telegram/webhook-info");
    state.cache.telegramWebhook = payload.info || null;
  } catch (err) {
    state.cache.telegramWebhook = {
      error: err.message,
    };
  }
}

function renderTelegramInfo() {
  const info = state.cache.telegramWebhook;
  if (!info) {
    writeOutput("telegram-webhook-status", "Sem dados");
    return;
  }

  const simplified = info.error
    ? { ok: false, error: info.error }
    : {
        ok: true,
        webhook_url: info.url,
        pending_updates: info.pending_update_count,
        last_error_date: info.last_error_date,
        last_error_message: info.last_error_message,
        ip_address: info.ip_address,
      };

  writeOutput("telegram-webhook-status", simplified);
}

async function loadAllData() {
  const userId = await ensureUser();
  const filterParams = currentFilterParams();

  const common = {
    user_id: userId,
    ...filterParams,
  };

  const [dashboard, profile, reports, measurements, bioimpedance, exams, hydration, workouts, nutrition] = await Promise.all([
    apiJson(`/api/dashboard/overview?${queryStringFromObject({ user_id: userId })}`),
    apiJson(`/api/profile?${queryStringFromObject({ user_id: userId })}`),
    apiJson(`/api/reports?${queryStringFromObject({ user_id: userId, period: "daily", limit: 14 })}`),
    apiJson(`/api/measurements?${queryStringFromObject({ ...common, limit: 200 })}`),
    apiJson(`/api/bioimpedance?${queryStringFromObject({ ...common, limit: 200 })}`),
    apiJson(`/api/medical-exams?${queryStringFromObject({ ...common, limit: 150 })}`),
    apiJson(`/api/hydration?${queryStringFromObject({ ...common, limit: 500 })}`),
    apiJson(`/api/workouts?${queryStringFromObject({ ...common, limit: 300 })}`),
    apiJson(`/api/nutrition?${queryStringFromObject({ ...common, limit: 300 })}`),
  ]);

  state.cache.dashboard = dashboard;
  state.cache.profile = profile.profile || dashboard?.overview?.profile || null;
  state.cache.reports = reports.reports || [];
  state.cache.measurements = measurements.measurements || [];
  state.cache.bioimpedance = bioimpedance.records || [];
  state.cache.exams = exams.exams || [];
  state.cache.hydration = hydration.hydration || [];
  state.cache.workouts = workouts.workouts || [];
  state.cache.nutrition = nutrition.nutrition || [];

  renderMetricCards();
  renderProfileSummary();
  renderProgressPhotos();
  renderClinicalOverview();
  renderDailyComparison();
  renderWorkoutInsights();
  renderReports();
  renderHistories();
  renderExamPanel();
  renderNutritionDashboard();
  renderCharts();

  await loadTelegramWebhookInfo();
  renderTelegramInfo();
}

function bindForm(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      setStatus("Processando...", "info");
      await ensureUser();
      const payload = formToObject(form);
      await handler(payload, form);
    } catch (err) {
      setStatus(`Erro: ${err.message}`, "error");
    }
  });
}

async function refreshAllWithStatus(successMessage = "Dados atualizados.") {
  updateFilterSummary();
  await loadAllData();
  setStatus(successMessage, "success");
}

function setupDateFilter() {
  const form = document.getElementById("date-filter-form");
  const fromInput = document.getElementById("filter-from");
  const toInput = document.getElementById("filter-to");
  const clearButton = document.getElementById("clear-date-filter");

  if (!form || !fromInput || !toInput || !clearButton) return;

  const today = todayInputValue();
  fromInput.value = today;
  toInput.value = today;
  state.filter.from = today;
  state.filter.to = today;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fallbackDate = todayInputValue();
    state.filter.from = fromInput.value || toInput.value || fallbackDate;
    state.filter.to = toInput.value || fromInput.value || fallbackDate;
    fromInput.value = state.filter.from;
    toInput.value = state.filter.to;

    try {
      setStatus("Aplicando filtro de data...", "info");
      await refreshAllWithStatus("Filtro aplicado.");
    } catch (err) {
      setStatus(`Erro ao aplicar filtro: ${err.message}`, "error");
    }
  });

  clearButton.addEventListener("click", async () => {
    const fallbackDate = todayInputValue();
    fromInput.value = fallbackDate;
    toInput.value = fallbackDate;
    state.filter.from = fallbackDate;
    state.filter.to = fallbackDate;

    try {
      setStatus("Voltando filtro para hoje...", "info");
      await refreshAllWithStatus("Filtro de hoje aplicado.");
    } catch (err) {
      setStatus(`Erro ao aplicar hoje: ${err.message}`, "error");
    }
  });

  updateFilterSummary();
}

function setupActions() {
  document.getElementById("refresh-dashboard")?.addEventListener("click", async () => {
    try {
      setStatus("Atualizando painel...", "info");
      await refreshAllWithStatus("Painel atualizado.");
    } catch (err) {
      setStatus(`Erro ao atualizar: ${err.message}`, "error");
    }
  });

  document.getElementById("generate-daily-report")?.addEventListener("click", async () => {
    try {
      const userId = await ensureUser();
      const today = new Date().toISOString().slice(0, 10);
      setStatus("Gerando relatório diário...", "info");

      await apiJson("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, period: "daily", report_date: today }),
      });

      await refreshAllWithStatus("Relatório diário gerado com sucesso.");
    } catch (err) {
      setStatus(`Erro ao gerar relatório: ${err.message}`, "error");
    }
  });

  document.getElementById("load-workout-recommendation")?.addEventListener("click", async () => {
    try {
      const userId = await ensureUser();
      setStatus("Gerando recomendação de treino...", "info");
      const payload = await apiJson(`/api/workouts/recommendation?${queryStringFromObject({ user_id: userId })}`);
      writeOutput("workout-recommendation", payload.recommendation);
      setStatus("Recomendação atualizada.", "success");
    } catch (err) {
      writeOutput("workout-recommendation", `Erro: ${err.message}`);
      setStatus(`Erro no treino: ${err.message}`, "error");
    }
  });
}

function setupForms() {
  bindForm("nutrition-form", async (payload, form) => {
    const userId = await ensureUser();
    const mode = payload.mode || "draft";

    if (mode === "chat") {
      const chat = await apiJson("/api/nutrition/chat", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, text: payload.text }),
      });

      writeOutputHtml(
        "nutrition-result",
        `
          <article class="analysis-card">
            <h4>Resposta em modo conversa</h4>
            <p>${escapeHtml(chat.replyText || "Sem resposta.")}</p>
          </article>
        `
      );
      form.reset();
      setStatus("Resposta de conversa gerada (sem registro).", "success");
      return;
    }

    const analysis = await apiJson("/api/nutrition/analyze-text", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, text: payload.text, persist: false }),
    });

    setNutritionDraftFromAnalysis(analysis, "texto");
    writeOutputHtml(
      "nutrition-result",
      buildNutritionAnalysisHtml(analysis, {
        title: "Última análise por texto",
        subtitle: "Ainda não foi registrada. Revise o rascunho abaixo e confirme quando estiver certo.",
      })
    );
    renderNutritionDraftPreview();

    const previousMode = form.querySelector("select[name='mode']")?.value || "draft";
    form.reset();
    const modeSelect = form.querySelector("select[name='mode']");
    if (modeSelect) modeSelect.value = previousMode;
    setStatus("Texto analisado e adicionado ao rascunho. Revise antes de registrar.", "success");
  });

  const nutritionImageForm = document.getElementById("nutrition-image-form");
  nutritionImageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const userId = await ensureUser();
      setStatus("Enviando foto para analise nutricional...", "info");

      const formData = new FormData(nutritionImageForm);
      formData.set("user_id", userId);
      formData.set("persist", "false");
      const result = await apiFormData("/api/nutrition/analyze-image", formData);
      setNutritionDraftFromAnalysis(result, "foto");
      writeOutputHtml(
        "nutrition-image-result",
        buildNutritionAnalysisHtml(result, {
          title: "Última análise por foto",
          subtitle: "A foto foi analisada, mas ainda não foi registrada.",
        })
      );
      renderNutritionDraftPreview();
      nutritionImageForm.reset();
      setStatus("Foto analisada e adicionada ao rascunho.", "success");
    } catch (err) {
      writeOutput("nutrition-image-result", `Erro: ${err.message}`);
      setStatus(`Erro na foto da alimentacao: ${err.message}`, "error");
    }
  });

  const nutritionAudioForm = document.getElementById("nutrition-audio-form");
  nutritionAudioForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const userId = await ensureUser();
      setStatus("Enviando audio para analise nutricional...", "info");

      const formData = new FormData(nutritionAudioForm);
      formData.set("user_id", userId);
      formData.set("persist", "false");
      const result = await apiFormData("/api/nutrition/analyze-audio", formData);
      setNutritionDraftFromAnalysis(result, "áudio");
      writeOutputHtml(
        "nutrition-audio-result",
        buildNutritionAnalysisHtml(result, {
          title: "Última análise por áudio",
          subtitle: "O áudio foi analisado, mas ainda não foi registrado.",
        })
      );
      renderNutritionDraftPreview();
      nutritionAudioForm.reset();
      setStatus("Áudio analisado e adicionado ao rascunho.", "success");
    } catch (err) {
      writeOutput("nutrition-audio-result", `Erro: ${err.message}`);
      setStatus(`Erro no audio da alimentacao: ${err.message}`, "error");
    }
  });

  const nutritionDraftForm = document.getElementById("nutrition-draft-form");
  nutritionDraftForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      if (!state.nutritionDraft) {
        throw new Error("Nenhum rascunho ativo para registrar.");
      }

      const userId = await ensureUser();
      const formData = new FormData(nutritionDraftForm);
      const mealSlot = String(formData.get("meal_slot") || "").trim();
      const slotKey = MEAL_SLOTS.some((item) => item.key === mealSlot) ? mealSlot : state.nutritionDraft.analysis.meal_slot;

      setStatus("Registrando refeição do rascunho...", "info");
      await apiJson("/api/nutrition/register-draft", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          analysis: {
            ...state.nutritionDraft.analysis,
            meal_slot: slotKey || "outro",
          },
          meal_slot: slotKey || "outro",
          raw_input_text: (state.nutritionDraft.rawInputs || []).join(" | "),
          input_type: state.nutritionDraft.inputType || "manual",
          source: "web",
          model_used: state.nutritionDraft.modelUsed || "web_draft",
          raw_response: state.nutritionDraft.rawResponse || "",
          extra_ai_payload: {
            draft_sources: state.nutritionDraft.sources || [],
            draft_inputs_count: (state.nutritionDraft.rawInputs || []).length,
            draft_registered_via: "web",
          },
        }),
      });

      clearNutritionDraft();
      renderNutritionDraftPreview();
      nutritionDraftForm.reset();
      await refreshAllWithStatus("Refeição registrada a partir do rascunho.");
    } catch (err) {
      setStatus(`Erro ao registrar rascunho: ${err.message}`, "error");
    }
  });

  document.getElementById("nutrition-draft-clear")?.addEventListener("click", () => {
    clearNutritionDraft();
    renderNutritionDraftPreview();
    setStatus("Rascunho descartado.", "info");
  });

  bindForm("hydration-form", async (payload, form) => {
    const userId = await ensureUser();

    await apiJson("/api/hydration", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        amount_ml: Number(payload.amount_ml),
        notes: payload.notes,
        source: "web",
      }),
    });

    form.reset();
    await refreshAllWithStatus("Hidratação registrada.");
  });

  bindForm("profile-form", async (payload, form) => {
    const userId = await ensureUser();

    await apiJson("/api/profile", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ...payload }),
    });

    form.reset();
    await refreshAllWithStatus("Perfil salvo.");
  });

  bindForm("measurement-form", async (payload, form) => {
    const userId = await ensureUser();

    await apiJson("/api/measurements", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ...payload }),
    });

    form.reset();
    await refreshAllWithStatus("Medidas corporais salvas.");
  });

  const measurementPhotoForm = document.getElementById("measurement-photo-form");
  measurementPhotoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const userId = await ensureUser();
      setStatus("Enviando foto de evolução...", "info");

      const formData = new FormData(measurementPhotoForm);
      formData.set("user_id", userId);
      const result = await apiFormData("/api/measurements/progress-photo", formData);

      writeOutput("measurement-photo-result", result);
      measurementPhotoForm.reset();
      await refreshAllWithStatus("Foto de evolução salva.");
    } catch (err) {
      writeOutput("measurement-photo-result", `Erro: ${err.message}`);
      setStatus(`Erro no upload da foto de evolução: ${err.message}`, "error");
    }
  });

  bindForm("bioimpedance-form", async (payload, form) => {
    const userId = await ensureUser();

    await apiJson("/api/bioimpedance", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ...payload }),
    });

    form.reset();
    await refreshAllWithStatus("Bioimpedância salva.");
  });

  bindForm("exam-form", async (payload, form) => {
    const userId = await ensureUser();
    let markers = {};

    if (payload.markers) {
      try {
        markers = JSON.parse(payload.markers);
      } catch {
        throw new Error("Marcadores do exame devem estar em JSON válido");
      }
    }

    await apiJson("/api/medical-exams", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        exam_name: payload.exam_name,
        exam_type: payload.exam_type,
        exam_date: payload.exam_date,
        markers,
      }),
    });

    form.reset();
    await refreshAllWithStatus("Exame médico salvo.");
  });

  bindForm("workout-form", async (payload, form) => {
    const userId = await ensureUser();

    await apiJson("/api/workouts", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ...payload }),
    });

    form.reset();
    await refreshAllWithStatus("Treino salvo.");
  });

  const bioUploadForm = document.getElementById("bioimpedance-upload-form");
  bioUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const userId = await ensureUser();
      setStatus("Enviando bioimpedância para análise...", "info");

      const formData = new FormData(bioUploadForm);
      formData.set("user_id", userId);
      const result = await apiFormData("/api/bioimpedance/upload", formData);

      writeOutput("bioimpedance-upload-result", result);
      bioUploadForm.reset();
      await refreshAllWithStatus("Bioimpedância por anexo processada.");
    } catch (err) {
      writeOutput("bioimpedance-upload-result", `Erro: ${err.message}`);
      setStatus(`Erro no upload de bioimpedância: ${err.message}`, "error");
    }
  });

  const examUploadForm = document.getElementById("exam-upload-form");
  examUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const userId = await ensureUser();
      setStatus("Enviando exame para análise...", "info");

      const formData = new FormData(examUploadForm);
      formData.set("user_id", userId);
      const result = await apiFormData("/api/medical-exams/upload", formData);

      writeOutput("exam-upload-result", result);
      examUploadForm.reset();
      await refreshAllWithStatus("Exame por anexo processado.");
    } catch (err) {
      writeOutput("exam-upload-result", `Erro: ${err.message}`);
      setStatus(`Erro no upload de exame: ${err.message}`, "error");
    }
  });
}

async function boot() {
  setupTabs();
  setupDateFilter();
  setupActions();
  setupForms();
  renderNutritionDraftPreview();

  try {
    setStatus("Carregando dados...", "info");
    await loadAllData();
    updateFilterSummary();
    setStatus("Painel carregado.", "success");
  } catch (err) {
    setStatus(`Painel carregado com aviso: ${err.message}`, "warning");
  }
}

boot();
