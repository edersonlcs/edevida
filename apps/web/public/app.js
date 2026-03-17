const state = {
  userId: null,
};

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

function compactObject(source) {
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === "" || value === undefined || value === null) continue;
    output[key] = value;
  }
  return output;
}

function formToObject(form) {
  const formData = new FormData(form);
  return compactObject(Object.fromEntries(formData.entries()));
}

function writeOutput(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function showFlash(message) {
  writeOutput("nutrition-result", message);
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

function bindForm(formId, handler) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await ensureUser();
      const payload = formToObject(form);
      await handler(payload, form);
    } catch (err) {
      showFlash(`Erro: ${err.message}`);
    }
  });
}

async function refreshDashboard() {
  const userId = await ensureUser();
  const dashboard = await apiJson(`/api/dashboard/overview?user_id=${userId}`);
  const overview = dashboard.overview;

  document.getElementById("metric-water").textContent = `${overview.today.hydration_total_ml} ml`;
  document.getElementById("metric-meals").textContent = String(overview.today.nutrition_count);
  document.getElementById("metric-last-quality").textContent = overview.today.latest_nutrition?.meal_quality || "sem registro";
  document.getElementById("metric-workouts").textContent = String(overview.week.workout_sessions);
  document.getElementById("metric-workout-minutes").textContent = `${overview.week.total_workout_minutes} min`;

  const reports = await apiJson(`/api/reports?user_id=${userId}&period=daily&limit=7`);
  writeOutput("reports-output", reports.reports || []);
}

async function generateDailyReport() {
  const userId = await ensureUser();
  const today = new Date().toISOString().slice(0, 10);

  await apiJson("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      period: "daily",
      report_date: today,
    }),
  });

  await refreshDashboard();
  showFlash("Relatorio diario gerado com sucesso.");
}

async function loadWorkoutRecommendation() {
  const userId = await ensureUser();
  const payload = await apiJson(`/api/workouts/recommendation?user_id=${userId}`);
  writeOutput("workout-recommendation", payload.recommendation);
}

function setupActions() {
  document.getElementById("refresh-dashboard")?.addEventListener("click", async () => {
    try {
      await refreshDashboard();
      showFlash("Dashboard atualizado.");
    } catch (err) {
      showFlash(`Erro: ${err.message}`);
    }
  });

  document.getElementById("generate-daily-report")?.addEventListener("click", async () => {
    try {
      await generateDailyReport();
    } catch (err) {
      showFlash(`Erro: ${err.message}`);
    }
  });

  document.getElementById("load-workout-recommendation")?.addEventListener("click", async () => {
    try {
      await loadWorkoutRecommendation();
    } catch (err) {
      writeOutput("workout-recommendation", `Erro: ${err.message}`);
    }
  });
}

function setupForms() {
  bindForm("nutrition-form", async (payload, form) => {
    const userId = await ensureUser();

    const analysis = await apiJson("/api/nutrition/analyze-text", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        text: payload.text,
      }),
    });

    writeOutput("nutrition-result", {
      quality: analysis.quality,
      replyText: analysis.replyText,
      analysis: analysis.analysis,
    });

    form.reset();
    await refreshDashboard();
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
    await refreshDashboard();
  });

  bindForm("profile-form", async (payload, form) => {
    const userId = await ensureUser();
    await apiJson("/api/profile", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ...payload,
      }),
    });

    form.reset();
    showFlash("Perfil salvo.");
  });

  bindForm("measurement-form", async (payload, form) => {
    const userId = await ensureUser();
    await apiJson("/api/measurements", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ...payload,
      }),
    });

    form.reset();
    await refreshDashboard();
  });

  bindForm("bioimpedance-form", async (payload, form) => {
    const userId = await ensureUser();
    await apiJson("/api/bioimpedance", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ...payload,
      }),
    });

    form.reset();
    showFlash("Bioimpedancia salva.");
  });

  bindForm("exam-form", async (payload, form) => {
    const userId = await ensureUser();

    let markers = {};
    if (payload.markers) {
      try {
        markers = JSON.parse(payload.markers);
      } catch {
        throw new Error("Marcadores do exame devem estar em JSON valido");
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
    showFlash("Exame medico salvo.");
  });

  bindForm("workout-form", async (payload, form) => {
    const userId = await ensureUser();
    await apiJson("/api/workouts", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ...payload,
      }),
    });

    form.reset();
    await refreshDashboard();
  });

  const bioUploadForm = document.getElementById("bioimpedance-upload-form");
  bioUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const userId = await ensureUser();
      const formData = new FormData(bioUploadForm);
      formData.set("user_id", userId);

      const result = await apiFormData("/api/bioimpedance/upload", formData);
      writeOutput("bioimpedance-upload-result", result);

      bioUploadForm.reset();
      await refreshDashboard();
      showFlash("Bioimpedancia por anexo processada.");
    } catch (err) {
      writeOutput("bioimpedance-upload-result", `Erro: ${err.message}`);
    }
  });

  const examUploadForm = document.getElementById("exam-upload-form");
  examUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const userId = await ensureUser();
      const formData = new FormData(examUploadForm);
      formData.set("user_id", userId);

      const result = await apiFormData("/api/medical-exams/upload", formData);
      writeOutput("exam-upload-result", result);

      examUploadForm.reset();
      showFlash("Exame por anexo processado.");
    } catch (err) {
      writeOutput("exam-upload-result", `Erro: ${err.message}`);
    }
  });
}

async function boot() {
  setupActions();
  setupForms();

  try {
    await refreshDashboard();
  } catch (err) {
    showFlash(`Painel carregado com aviso: ${err.message}`);
  }
}

boot();
