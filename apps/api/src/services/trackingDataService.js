const { supabase } = require("../integrations/supabaseClient");

function parseNumeric(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function safeJsonObject(input) {
  if (!input) return {};
  if (typeof input === "object") return input;

  try {
    const parsed = JSON.parse(input);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function upsertUserProfile({
  userId,
  birth_date,
  biological_sex,
  height_cm,
  baseline_weight_kg,
  routine_notes,
  medical_history,
}) {
  const payload = {
    user_id: userId,
    birth_date: birth_date || null,
    biological_sex: biological_sex || null,
    height_cm: parseNumeric(height_cm),
    baseline_weight_kg: parseNumeric(baseline_weight_kg),
    routine_notes: routine_notes || null,
    medical_history: safeJsonObject(medical_history),
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar perfil: ${error.message}`);
  }

  return data;
}

async function getUserProfile(userId) {
  const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar perfil: ${error.message}`);
  }

  return data;
}

async function createGoal({ userId, goal_type, target_weight_kg, target_date, priority, notes }) {
  const { data, error } = await supabase
    .from("user_goals")
    .insert({
      user_id: userId,
      goal_type,
      target_weight_kg: parseNumeric(target_weight_kg),
      target_date: target_date || null,
      priority: priority || "health",
      notes: notes || null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar meta: ${error.message}`);
  }

  return data;
}

async function listGoals(userId) {
  const { data, error } = await supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao listar metas: ${error.message}`);
  }

  return data || [];
}

async function createBodyMeasurement({
  userId,
  weight_kg,
  body_fat_pct,
  chest_cm,
  waist_cm,
  abdomen_cm,
  hip_cm,
  arm_cm,
  thigh_cm,
  calf_cm,
  progress_photo_url,
  notes,
  recorded_at,
}) {
  const profile = await getUserProfile(userId);
  const heightCm = parseNumeric(profile?.height_cm);
  const weightKg = parseNumeric(weight_kg);

  let bmi = null;
  if (heightCm && weightKg) {
    const heightMeters = heightCm / 100;
    bmi = Number((weightKg / (heightMeters * heightMeters)).toFixed(2));
  }

  const { data, error } = await supabase
    .from("body_measurements")
    .insert({
      user_id: userId,
      weight_kg: weightKg,
      bmi,
      body_fat_pct: parseNumeric(body_fat_pct),
      chest_cm: parseNumeric(chest_cm),
      waist_cm: parseNumeric(waist_cm),
      abdomen_cm: parseNumeric(abdomen_cm),
      hip_cm: parseNumeric(hip_cm),
      arm_cm: parseNumeric(arm_cm),
      thigh_cm: parseNumeric(thigh_cm),
      calf_cm: parseNumeric(calf_cm),
      progress_photo_url: progress_photo_url || null,
      notes: notes || null,
      recorded_at: recorded_at || new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar medida corporal: ${error.message}`);
  }

  return data;
}

async function listBodyMeasurements(userId, { from, to, limit = 30 } = {}) {
  let query = supabase.from("body_measurements").select("*").eq("user_id", userId).order("recorded_at", { ascending: false });

  if (from) query = query.gte("recorded_at", from);
  if (to) query = query.lte("recorded_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar medidas corporais: ${error.message}`);
  }

  return data || [];
}

async function getBodyMeasurementById(userId, measurementId) {
  const { data, error } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .eq("id", measurementId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar medida corporal: ${error.message}`);
  }

  return data || null;
}

async function deleteBodyMeasurement(userId, measurementId) {
  const { data, error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("user_id", userId)
    .eq("id", measurementId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao remover medida corporal: ${error.message}`);
  }

  return data || null;
}

async function createBioimpedanceRecord({
  userId,
  body_fat_pct,
  muscle_mass_kg,
  visceral_fat_level,
  body_water_pct,
  bmr_kcal,
  metabolic_age,
  lean_mass_kg,
  notes,
  recorded_at,
}) {
  const payload = {
    user_id: userId,
    body_fat_pct: parseNumeric(body_fat_pct),
    muscle_mass_kg: parseNumeric(muscle_mass_kg),
    visceral_fat_level: parseNumeric(visceral_fat_level),
    body_water_pct: parseNumeric(body_water_pct),
    bmr_kcal: parseNumeric(bmr_kcal),
    metabolic_age: parseNumeric(metabolic_age),
    lean_mass_kg: parseNumeric(lean_mass_kg),
    notes: notes || null,
    recorded_at: recorded_at || new Date().toISOString(),
  };

  const { data, error } = await supabase.from("bioimpedance_records").insert(payload).select("*").single();

  if (error) {
    throw new Error(`Erro ao salvar bioimpedancia: ${error.message}`);
  }

  return data;
}

async function listBioimpedanceRecords(userId, { from, to, limit = 30 } = {}) {
  let query = supabase.from("bioimpedance_records").select("*").eq("user_id", userId).order("recorded_at", { ascending: false });

  if (from) query = query.gte("recorded_at", from);
  if (to) query = query.lte("recorded_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar bioimpedancia: ${error.message}`);
  }

  return data || [];
}

async function getBioimpedanceRecordById(userId, recordId) {
  const { data, error } = await supabase
    .from("bioimpedance_records")
    .select("*")
    .eq("user_id", userId)
    .eq("id", recordId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar bioimpedancia: ${error.message}`);
  }

  return data || null;
}

async function deleteBioimpedanceRecord(userId, recordId) {
  const { data, error } = await supabase
    .from("bioimpedance_records")
    .delete()
    .eq("user_id", userId)
    .eq("id", recordId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao remover bioimpedancia: ${error.message}`);
  }

  return data || null;
}

async function createMedicalExam({ userId, exam_name, exam_type, exam_date, markers, file_url, notes }) {
  const payload = {
    user_id: userId,
    exam_name,
    exam_type: exam_type || null,
    exam_date: exam_date || null,
    markers: safeJsonObject(markers),
    file_url: file_url || null,
    notes: notes || null,
  };

  const { data, error } = await supabase.from("medical_exams").insert(payload).select("*").single();

  if (error) {
    throw new Error(`Erro ao salvar exame medico: ${error.message}`);
  }

  return data;
}

async function listMedicalExams(userId, { from, to, limit = 30 } = {}) {
  let query = supabase
    .from("medical_exams")
    .select("*")
    .eq("user_id", userId)
    .order("exam_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar exames medicos: ${error.message}`);
  }

  return data || [];
}

async function getMedicalExamById(userId, examId) {
  const { data, error } = await supabase
    .from("medical_exams")
    .select("*")
    .eq("user_id", userId)
    .eq("id", examId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar exame medico: ${error.message}`);
  }

  return data || null;
}

async function updateMedicalExam(userId, examId, updates) {
  const payload = updates && typeof updates === "object" ? updates : {};

  const { data, error } = await supabase
    .from("medical_exams")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", examId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao atualizar exame medico: ${error.message}`);
  }

  return data || null;
}

async function deleteMedicalExam(userId, examId) {
  const { data, error } = await supabase
    .from("medical_exams")
    .delete()
    .eq("user_id", userId)
    .eq("id", examId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao remover exame medico: ${error.message}`);
  }

  return data || null;
}

async function createHydrationLog({ userId, amount_ml, source = "web", notes, recorded_at }) {
  const { data, error } = await supabase
    .from("hydration_logs")
    .insert({
      user_id: userId,
      amount_ml: Number(amount_ml),
      source,
      notes: notes || null,
      recorded_at: recorded_at || new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar hidratacao: ${error.message}`);
  }

  return data;
}

async function listHydrationLogs(userId, { from, to, limit = 100 } = {}) {
  let query = supabase.from("hydration_logs").select("*").eq("user_id", userId).order("recorded_at", { ascending: false });

  if (from) query = query.gte("recorded_at", from);
  if (to) query = query.lte("recorded_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar hidratacao: ${error.message}`);
  }

  return data || [];
}

async function createWorkoutSession({
  userId,
  activity_type,
  duration_minutes,
  intensity,
  calories_burned_est,
  notes,
  started_at,
  ended_at,
  source = "web",
}) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: userId,
      activity_type,
      duration_minutes: parseNumeric(duration_minutes),
      intensity: intensity || null,
      calories_burned_est: parseNumeric(calories_burned_est),
      notes: notes || null,
      started_at: started_at || null,
      ended_at: ended_at || null,
      source,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar treino: ${error.message}`);
  }

  return data;
}

async function listWorkoutSessions(userId, { from, to, limit = 100 } = {}) {
  let query = supabase.from("workout_sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false });

  if (from) query = query.gte("started_at", from);
  if (to) query = query.lte("started_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar treinos: ${error.message}`);
  }

  return data || [];
}

async function listNutritionEntries(userId, { from, to, limit = 50 } = {}) {
  let query = supabase.from("nutrition_entries").select("*").eq("user_id", userId).order("recorded_at", { ascending: false });

  if (from) query = query.gte("recorded_at", from);
  if (to) query = query.lte("recorded_at", to);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Erro ao listar refeicoes: ${error.message}`);
  }

  return data || [];
}

async function getNutritionEntryById(userId, entryId) {
  const { data, error } = await supabase
    .from("nutrition_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar refeicao: ${error.message}`);
  }

  return data || null;
}

async function updateNutritionEntry(userId, entryId, updates) {
  const payload = updates && typeof updates === "object" ? updates : {};

  const { data, error } = await supabase
    .from("nutrition_entries")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", entryId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao atualizar refeicao: ${error.message}`);
  }

  return data || null;
}

async function getUserAiSettings(userId) {
  const profile = await getUserProfile(userId);
  const medicalHistory = safeJsonObject(profile?.medical_history);
  return safeJsonObject(medicalHistory.ai_settings);
}

async function saveUserAiSettings(userId, aiSettings) {
  const profile = await getUserProfile(userId);
  const medicalHistory = safeJsonObject(profile?.medical_history);
  const nextMedicalHistory = {
    ...medicalHistory,
    ai_settings: safeJsonObject(aiSettings),
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        medical_history: nextMedicalHistory,
      },
      { onConflict: "user_id" }
    )
    .select("medical_history")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar configuracoes de IA: ${error.message}`);
  }

  return safeJsonObject(data?.medical_history?.ai_settings);
}

module.exports = {
  parseNumeric,
  safeJsonObject,
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
};
