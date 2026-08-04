create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  grade_level int not null default 9,
  created_at timestamptz not null default now()
);

create table test_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  subject_id text not null,
  topic_ids text[] not null,
  difficulty text not null,
  question_type text not null,
  question_count int not null,
  time_limit_minutes int not null,
  score int,
  percentage numeric,
  time_taken_seconds int,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table test_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references test_attempts(id) on delete cascade,
  subject_id text not null,
  topic_id text not null,
  difficulty text not null,
  question_type text not null,
  prompt text not null,
  options jsonb,
  correct_answer text,
  explanation text,
  created_at timestamptz not null default now()
);

create table student_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references test_questions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  is_correct boolean,
  created_at timestamptz not null default now()
);
