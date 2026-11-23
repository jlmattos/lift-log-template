-- ============================================================================
-- Lift Log — complete database schema (generated from a live instance)
-- ============================================================================
-- Paste this whole file into the Supabase SQL editor of a NEW project and run
-- it once. It creates every table, constraint, index and function the app
-- expects. Safe to re-run (everything is IF NOT EXISTS / OR REPLACE).
--
-- Row Level Security is ENABLED on every table with NO policies: the app talks
-- to the database only from server code using the project's secret (service
-- role) key, which bypasses RLS, so the publishable/anon key can read nothing.
-- Keep it that way — there is no login screen.
--
-- Later schema changes live in drizzle/ as numbered SQL files (0020+) and are
-- applied the same way, by hand, in the SQL editor.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Core: exercises, equipment, templates ───────────────────────────────────

create table if not exists equipment (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  bar_weight  numeric not null,
  created_at  timestamptz not null default now()
);

create table if not exists exercises (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  is_unilateral   boolean not null default false,
  created_at      timestamptz not null default now(),
  equipment_type  text not null default 'other',
  body_part       text not null default 'other',
  equipment_id    uuid references equipment(id) on delete set null,
  constraint exercises_name_unique unique (name)
);

create table if not exists templates (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_at          timestamptz not null default now(),
  category            text,
  prescription_notes  text,
  constraint templates_name_unique unique (name)
);

create table if not exists template_exercises (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references templates(id) on delete cascade,
  exercise_id    uuid not null references exercises(id),
  position       integer not null,
  created_at     timestamptz not null default now(),
  target_sets    integer,
  target_reps    text,
  -- Supersets: adjacent rows (by position) sharing a block form one group.
  block          smallint,
  -- Rest after a set (round rest when last in a block); timed-set duration.
  rest_seconds   integer,
  timed_seconds  integer,
  constraint template_exercises_rest_seconds_check
    check (rest_seconds is null or (rest_seconds >= 0 and rest_seconds <= 3600)),
  constraint template_exercises_timed_seconds_check
    check (timed_seconds is null or (timed_seconds > 0 and timed_seconds <= 7200))
);
create index if not exists template_exercises_template_idx on template_exercises (template_id);

-- ── Workouts & sets ─────────────────────────────────────────────────────────

create table if not exists workouts (
  id            uuid primary key default gen_random_uuid(),
  performed_on  date not null default now(),
  notes         text,
  created_at    timestamptz not null default now(),
  template_id   uuid references templates(id),
  completed_at  timestamptz
);
create unique index if not exists workouts_one_per_day on workouts (performed_on);
create index if not exists workouts_performed_on_idx on workouts (performed_on);
create index if not exists idx_workouts_created_at on workouts (created_at);

create table if not exists sets (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references workouts(id) on delete cascade,
  exercise_id  uuid not null references exercises(id),
  set_index    integer not null,
  side         text not null,          -- 'both' | 'left' | 'right'
  reps         integer not null,
  load         numeric not null,
  rpe          numeric,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists sets_workout_idx on sets (workout_id);
create index if not exists sets_exercise_idx on sets (exercise_id);
create index if not exists sets_exercise_side_idx on sets (exercise_id, side);
create index if not exists idx_sets_created_at on sets (created_at);

-- Per-workout "swap this planned exercise out for today" records.
create table if not exists workout_exercise_skips (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references workouts(id) on delete cascade,
  exercise_id  uuid not null references exercises(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (workout_id, exercise_id)
);
create index if not exists idx_workout_exercise_skips_workout on workout_exercise_skips (workout_id);

-- ── Cardio ──────────────────────────────────────────────────────────────────

create table if not exists cardio_templates (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  type                text not null,
  prescription_notes  text,
  tracked_metrics     jsonb not null default '[]'::jsonb,
  strava_match_type   text,
  created_at          timestamptz not null default now(),
  protocol            text,
  allowed_modalities  jsonb
);

create table if not exists cardio_sessions (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null default 'strava',   -- 'strava' | 'intervals' | 'manual'
  strava_activity_id     bigint unique,
  performed_on           date not null,
  started_at             timestamptz,
  type                   text not null,
  name                   text,
  duration_min           numeric not null,
  distance_m             numeric,
  avg_hr                 numeric,
  max_hr                 numeric,
  avg_watts              numeric,
  suffer_score           numeric,
  estimated_load         numeric,
  notes                  text,
  created_at             timestamptz not null default now(),
  cardio_template_id     uuid references cardio_templates(id) on delete set null,
  manual_metrics         jsonb,
  protocol               text,
  modality               text,
  intervals_activity_id  text unique
);
create index if not exists idx_cardio_sessions_performed_on on cardio_sessions (performed_on desc);
create index if not exists idx_cardio_sessions_created_at on cardio_sessions (created_at);
create index if not exists idx_cardio_sessions_protocol on cardio_sessions (protocol);
create index if not exists idx_cardio_sessions_template on cardio_sessions (cardio_template_id);

-- Strava OAuth tokens (only used if the Strava integration is configured).
create table if not exists strava_tokens (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     bigint not null,
  athlete_name   text,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  scope          text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Routines (multi-week schedules of templates / cardio days) ──────────────

create table if not exists routines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  weeks       integer not null default 1,
  is_active   boolean not null default false,
  started_on  date,
  created_at  timestamptz not null default now(),
  cycle_days  integer,
  constraint routines_name_unique unique (name)
);

create table if not exists routine_days (
  id                    uuid primary key default gen_random_uuid(),
  routine_id            uuid not null references routines(id) on delete cascade,
  week_number           integer not null,
  day_number            integer not null,
  template_id           uuid references templates(id) on delete set null,
  created_at            timestamptz not null default now(),
  planned_cardio_type   text,
  planned_cardio_notes  text,
  cardio_template_id    uuid references cardio_templates(id) on delete set null,
  notes                 text,
  constraint routine_days_unique unique (routine_id, week_number, day_number),
  constraint routine_days_day_number_check check (day_number >= 1 and day_number <= 21)
);

create table if not exists routine_skips (
  id                  uuid primary key default gen_random_uuid(),
  routine_id          uuid not null references routines(id) on delete cascade,
  template_id         uuid references templates(id) on delete cascade,
  skipped_on          date not null default current_date,
  created_at          timestamptz not null default now(),
  cardio_template_id  uuid references cardio_templates(id) on delete cascade,
  constraint routine_skips_target_check
    check ((template_id is not null) <> (cardio_template_id is not null))
);
create index if not exists routine_skips_routine_idx on routine_skips (routine_id);

-- Atomic helpers used by the routine editor (drag a day onto another).
create or replace function public.move_routine_day_content(src uuid, dst uuid)
returns void language sql as $$
  update routine_days rd
  set template_id          = case when rd.id = dst then s.template_id end,
      cardio_template_id   = case when rd.id = dst then s.cardio_template_id end,
      planned_cardio_type  = case when rd.id = dst then s.planned_cardio_type end,
      planned_cardio_notes = case when rd.id = dst then s.planned_cardio_notes end,
      notes                = case when rd.id = dst then s.notes end
  from (select * from routine_days where id = src) s
  where rd.id in (src, dst);
$$;

create or replace function public.swap_routine_day_content(a uuid, b uuid)
returns void language sql as $$
  update routine_days rd
  set template_id          = o.template_id,
      cardio_template_id   = o.cardio_template_id,
      planned_cardio_type  = o.planned_cardio_type,
      planned_cardio_notes = o.planned_cardio_notes,
      notes                = o.notes
  from routine_days o
  where rd.id in (a, b) and o.id in (a, b) and rd.id <> o.id;
$$;

-- ── Body, health, goals ─────────────────────────────────────────────────────

create table if not exists bodyweight_logs (
  id           uuid primary key default gen_random_uuid(),
  measured_on  date not null,
  weight_lbs   numeric not null check (weight_lbs > 0),
  notes        text,
  created_at   timestamptz not null default now(),
  constraint bodyweight_logs_one_per_day unique (measured_on)
);
create index if not exists bodyweight_logs_date_idx on bodyweight_logs (measured_on);
create index if not exists idx_bodyweight_logs_created_at on bodyweight_logs (created_at);

create table if not exists injury_areas (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text,
  created_at              timestamptz not null default now(),
  related_body_parts      text[] not null default '{}',
  status                  text not null default 'active',   -- 'active' | 'monitoring' | 'resolved'
  training_modifications  text,
  started_on              date,
  constraint injury_areas_name_unique unique (name)
);

create table if not exists symptom_checkins (
  id                uuid primary key default gen_random_uuid(),
  checked_on        date not null,
  area_id           uuid not null references injury_areas(id) on delete cascade,
  severity          integer not null check (severity >= 0 and severity <= 5),
  affected_sleep    boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  affected_workout  boolean not null default false,
  constraint symptom_checkins_unique unique (checked_on, area_id)
);
create index if not exists symptom_checkins_area_idx on symptom_checkins (area_id);
create index if not exists symptom_checkins_date_idx on symptom_checkins (checked_on);
create index if not exists idx_symptom_checkins_created_at on symptom_checkins (created_at);

create table if not exists lift_goals (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references exercises(id) on delete cascade,
  target_e1rm  numeric not null,
  target_date  date,
  note         text,
  achieved_on  date,
  created_at   timestamptz not null default now()
);
create unique index if not exists lift_goals_one_per_exercise on lift_goals (exercise_id);

-- Which of your exercises stands in for each strength-standard lift
-- (squat / bench / deadlift / press …) on the Strength Standards page.
create table if not exists benchmark_lifts (
  id             uuid primary key default gen_random_uuid(),
  exercise_id    uuid not null references exercises(id) on delete cascade,
  standard_lift  text not null,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint benchmark_lifts_unique_exercise unique (exercise_id)
);

create table if not exists exercise_notes (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references exercises(id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists exercise_notes_exercise_idx on exercise_notes (exercise_id);

-- ── Profile & AI advisor ────────────────────────────────────────────────────

create table if not exists user_profile (
  id          uuid primary key default gen_random_uuid(),
  sex         text check (sex in ('male', 'female')),
  created_at  timestamptz not null default now()
);

create table if not exists user_context (
  id              uuid primary key default gen_random_uuid(),
  goals           text,
  training_style  text,
  notes           text,
  updated_at      timestamptz not null default now()
);

create table if not exists chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  model       text not null default 'claude-sonnet-4-5',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_chat_conversations_updated on chat_conversations (updated_at desc);

create table if not exists chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references chat_conversations(id) on delete cascade,
  role             text not null,
  content          jsonb not null,
  tool_calls       jsonb,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now()
);
create index if not exists idx_chat_messages_conversation on chat_messages (conversation_id, created_at);

-- ── Row Level Security: on everywhere, no policies (server-only access) ─────

do $$
declare t text;
begin
  foreach t in array array[
    'equipment','exercises','templates','template_exercises','workouts','sets',
    'workout_exercise_skips','cardio_templates','cardio_sessions','strava_tokens',
    'routines','routine_days','routine_skips','bodyweight_logs','injury_areas',
    'symptom_checkins','lift_goals','benchmark_lifts','exercise_notes',
    'user_profile','user_context','chat_conversations','chat_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
