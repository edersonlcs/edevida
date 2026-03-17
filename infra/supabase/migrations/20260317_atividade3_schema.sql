-- Atividade 3: Schema inicial EdeVida
-- Executar com psql no banco Supabase

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique,
  telegram_username text,
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  birth_date date,
  biological_sex text check (biological_sex in ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm numeric(5,2),
  baseline_weight_kg numeric(5,2),
  routine_notes text,
  medical_history jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  goal_type text not null check (goal_type in ('lose_fat', 'gain_muscle', 'recomposition', 'maintenance', 'performance')),
  target_weight_kg numeric(5,2),
  target_date date,
  priority text not null default 'health' check (priority in ('health', 'aesthetics', 'performance')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  weight_kg numeric(5,2),
  bmi numeric(5,2),
  body_fat_pct numeric(5,2),
  chest_cm numeric(5,2),
  waist_cm numeric(5,2),
  abdomen_cm numeric(5,2),
  hip_cm numeric(5,2),
  arm_cm numeric(5,2),
  thigh_cm numeric(5,2),
  calf_cm numeric(5,2),
  progress_photo_url text,
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bioimpedance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  body_fat_pct numeric(5,2),
  muscle_mass_kg numeric(6,2),
  visceral_fat_level numeric(6,2),
  body_water_pct numeric(5,2),
  bmr_kcal integer,
  metabolic_age integer,
  lean_mass_kg numeric(6,2),
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medical_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  exam_name text not null,
  exam_type text,
  exam_date date,
  markers jsonb not null default '{}'::jsonb,
  file_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  input_type text not null check (input_type in ('text', 'photo', 'audio', 'manual')),
  source text not null default 'telegram' check (source in ('telegram', 'web', 'system')),
  raw_input_text text,
  analyzed_summary text,
  meal_quality text check (meal_quality in ('otimo', 'bom', 'ainda pode, mas pouco', 'ruim', 'nunca coma')),
  recommended_action text,
  estimated_calories numeric(7,2),
  estimated_protein_g numeric(7,2),
  estimated_carbs_g numeric(7,2),
  estimated_fat_g numeric(7,2),
  water_ml_recommended integer,
  ai_payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  amount_ml integer not null check (amount_ml > 0),
  source text not null default 'telegram' check (source in ('telegram', 'web', 'system', 'manual')),
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  activity_type text not null,
  duration_minutes integer,
  intensity text check (intensity in ('low', 'moderate', 'high')),
  calories_burned_est integer,
  notes text,
  started_at timestamptz,
  ended_at timestamptz,
  source text not null default 'manual' check (source in ('telegram', 'web', 'system', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  modality text not null check (modality in ('text', 'vision', 'audio', 'report', 'chat')),
  model_used text not null,
  input_excerpt text,
  response_text text,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_updates (
  update_id bigint primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  report_date date not null,
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  summary jsonb not null default '{}'::jsonb,
  generated_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date, period)
);

create index if not exists idx_body_measurements_user_recorded_at on public.body_measurements(user_id, recorded_at desc);
create index if not exists idx_bioimpedance_user_recorded_at on public.bioimpedance_records(user_id, recorded_at desc);
create index if not exists idx_medical_exams_user_exam_date on public.medical_exams(user_id, exam_date desc);
create index if not exists idx_nutrition_entries_user_recorded_at on public.nutrition_entries(user_id, recorded_at desc);
create index if not exists idx_hydration_logs_user_recorded_at on public.hydration_logs(user_id, recorded_at desc);
create index if not exists idx_workout_sessions_user_started_at on public.workout_sessions(user_id, started_at desc);
create index if not exists idx_ai_interactions_user_created_at on public.ai_interactions(user_id, created_at desc);

alter table public.app_users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_goals enable row level security;
alter table public.body_measurements enable row level security;
alter table public.bioimpedance_records enable row level security;
alter table public.medical_exams enable row level security;
alter table public.nutrition_entries enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.daily_reports enable row level security;

-- Triggers de updated_at

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_goals_updated_at on public.user_goals;
create trigger trg_user_goals_updated_at before update on public.user_goals
for each row execute function public.set_updated_at();

drop trigger if exists trg_body_measurements_updated_at on public.body_measurements;
create trigger trg_body_measurements_updated_at before update on public.body_measurements
for each row execute function public.set_updated_at();

drop trigger if exists trg_bioimpedance_records_updated_at on public.bioimpedance_records;
create trigger trg_bioimpedance_records_updated_at before update on public.bioimpedance_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_medical_exams_updated_at on public.medical_exams;
create trigger trg_medical_exams_updated_at before update on public.medical_exams
for each row execute function public.set_updated_at();

drop trigger if exists trg_nutrition_entries_updated_at on public.nutrition_entries;
create trigger trg_nutrition_entries_updated_at before update on public.nutrition_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_hydration_logs_updated_at on public.hydration_logs;
create trigger trg_hydration_logs_updated_at before update on public.hydration_logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_workout_sessions_updated_at on public.workout_sessions;
create trigger trg_workout_sessions_updated_at before update on public.workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_interactions_updated_at on public.ai_interactions;
create trigger trg_ai_interactions_updated_at before update on public.ai_interactions
for each row execute function public.set_updated_at();

drop trigger if exists trg_daily_reports_updated_at on public.daily_reports;
create trigger trg_daily_reports_updated_at before update on public.daily_reports
for each row execute function public.set_updated_at();
