const { supabase } = require("../integrations/supabaseClient");
const { FOOD_QUALITY_SCALE } = require("../config/constants");

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateReference(reportDate) {
  if (!reportDate) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const parsed = new Date(`${reportDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("report_date invalida. Use YYYY-MM-DD");
  }

  return parsed;
}

function getPeriodRange(period, reportDate) {
  const ref = parseDateReference(reportDate);
  let start = new Date(ref);
  let end = null;

  if (period === "daily") {
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period === "weekly") {
    const day = start.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - diffToMonday);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (period === "monthly") {
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  } else {
    throw new Error("period invalido. Use daily, weekly ou monthly");
  }

  return { startIso: start.toISOString(), endIso: end.toISOString(), reportDate: toIsoDate(ref) };
}

function sumNumber(list, mapper) {
  return list.reduce((acc, item) => {
    const value = Number(mapper(item));
    return acc + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

function averageNumber(list, mapper) {
  if (!list.length) return 0;
  return Number((sumNumber(list, mapper) / list.length).toFixed(2));
}

function buildQualityDistribution(entries) {
  const distribution = FOOD_QUALITY_SCALE.reduce((acc, quality) => {
    acc[quality] = 0;
    return acc;
  }, {});

  for (const item of entries) {
    if (item.meal_quality && distribution[item.meal_quality] !== undefined) {
      distribution[item.meal_quality] += 1;
    }
  }

  return distribution;
}

function buildActionHints({ hydrationTotalMl, workoutCount, badMeals }) {
  const hints = [];

  if (hydrationTotalMl < 2000) {
    hints.push("Aumentar consumo de agua para pelo menos 2.000 ml/dia.");
  }

  if (badMeals > 0) {
    hints.push("Reduzir itens classificados como ruim/critico no proximo periodo.");
  }

  if (workoutCount === 0) {
    hints.push("Incluir ao menos 1 treino leve/moderado no proximo periodo.");
  }

  if (hints.length === 0) {
    hints.push("Manter consistencia atual e revisar metas semanalmente.");
  }

  return hints;
}

async function fetchPeriodData(userId, { startIso, endIso }) {
  const [nutritionRes, hydrationRes, workoutRes, measurementRes, bioRes, examRes] = await Promise.all([
    supabase
      .from("nutrition_entries")
      .select("id, meal_quality, estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g, water_ml_recommended, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", startIso)
      .lt("recorded_at", endIso),
    supabase
      .from("hydration_logs")
      .select("id, amount_ml, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", startIso)
      .lt("recorded_at", endIso),
    supabase
      .from("workout_sessions")
      .select("id, activity_type, duration_minutes, calories_burned_est, intensity, started_at")
      .eq("user_id", userId)
      .gte("started_at", startIso)
      .lt("started_at", endIso),
    supabase
      .from("body_measurements")
      .select("id, weight_kg, body_fat_pct, bmi, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(2),
    supabase
      .from("bioimpedance_records")
      .select("id, body_fat_pct, muscle_mass_kg, body_water_pct, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(2),
    supabase
      .from("medical_exams")
      .select("id, exam_name, exam_date, markers, created_at")
      .eq("user_id", userId)
      .order("exam_date", { ascending: false })
      .limit(3),
  ]);

  const responses = [nutritionRes, hydrationRes, workoutRes, measurementRes, bioRes, examRes];
  const failed = responses.find((item) => item.error);

  if (failed?.error) {
    throw new Error(`Erro ao gerar relatorio: ${failed.error.message}`);
  }

  return {
    nutrition: nutritionRes.data || [],
    hydration: hydrationRes.data || [],
    workouts: workoutRes.data || [],
    measurements: measurementRes.data || [],
    bioimpedance: bioRes.data || [],
    exams: examRes.data || [],
  };
}

function buildTrend(latest, previous, field, unit) {
  if (!latest || !previous) return null;

  const latestValue = Number(latest[field]);
  const previousValue = Number(previous[field]);

  if (Number.isNaN(latestValue) || Number.isNaN(previousValue)) return null;

  const delta = Number((latestValue - previousValue).toFixed(2));

  return {
    latest: latestValue,
    previous: previousValue,
    delta,
    unit,
  };
}

function buildSummary(period, range, data) {
  const qualityDistribution = buildQualityDistribution(data.nutrition);
  const hydrationTotalMl = sumNumber(data.hydration, (item) => item.amount_ml);
  const workoutDuration = sumNumber(data.workouts, (item) => item.duration_minutes);
  const workoutCalories = sumNumber(data.workouts, (item) => item.calories_burned_est);

  const badMeals = qualityDistribution["ruim"] + qualityDistribution["nunca coma"];

  return {
    period,
    range,
    nutrition: {
      total_entries: data.nutrition.length,
      quality_distribution: qualityDistribution,
      avg_calories: averageNumber(data.nutrition, (item) => item.estimated_calories),
      avg_protein_g: averageNumber(data.nutrition, (item) => item.estimated_protein_g),
      avg_carbs_g: averageNumber(data.nutrition, (item) => item.estimated_carbs_g),
      avg_fat_g: averageNumber(data.nutrition, (item) => item.estimated_fat_g),
    },
    hydration: {
      total_ml: hydrationTotalMl,
      logs_count: data.hydration.length,
      estimated_goal_ml: 3000,
      goal_progress_pct: Number(((hydrationTotalMl / 3000) * 100).toFixed(1)),
    },
    workouts: {
      total_sessions: data.workouts.length,
      total_duration_minutes: workoutDuration,
      total_calories_burned_est: workoutCalories,
    },
    health_progress: {
      weight_trend: buildTrend(data.measurements[0], data.measurements[1], "weight_kg", "kg"),
      body_fat_trend: buildTrend(data.measurements[0], data.measurements[1], "body_fat_pct", "%"),
      muscle_mass_trend: buildTrend(data.bioimpedance[0], data.bioimpedance[1], "muscle_mass_kg", "kg"),
      latest_exams: data.exams,
    },
    action_hints: buildActionHints({
      hydrationTotalMl,
      workoutCount: data.workouts.length,
      badMeals,
    }),
  };
}

async function generateAndStoreReport({ userId, period = "daily", reportDate }) {
  const range = getPeriodRange(period, reportDate);
  const data = await fetchPeriodData(userId, range);
  const summary = buildSummary(period, { start: range.startIso, end: range.endIso }, data);

  const { data: stored, error } = await supabase
    .from("daily_reports")
    .upsert(
      {
        user_id: userId,
        report_date: range.reportDate,
        period,
        summary,
        generated_by: "system",
      },
      { onConflict: "user_id,report_date,period" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao salvar relatorio: ${error.message}`);
  }

  return stored;
}

async function listReports({ userId, period, limit = 30 }) {
  let query = supabase
    .from("daily_reports")
    .select("*")
    .eq("user_id", userId)
    .order("report_date", { ascending: false })
    .limit(limit);

  if (period) {
    query = query.eq("period", period);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao listar relatorios: ${error.message}`);
  }

  return data || [];
}

module.exports = {
  getPeriodRange,
  generateAndStoreReport,
  listReports,
};
