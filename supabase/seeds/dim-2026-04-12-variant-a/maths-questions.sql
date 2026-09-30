-- ============================================================================
-- Exampeak: Maths questions Q57-Q81, DİM Grade 9, Russian sector, Variant A,
-- 12 April 2026. Questions only, in Russian. Options and answers come later.
-- ============================================================================
--
-- Paste the whole file into the Supabase SQL editor and run it once. It is one
-- transaction: if anything fails, nothing is changed.
--
-- What it does
--   1. Adds question statuses to the database (migration 0008). Existing
--      questions are all marked ready, so nothing students see changes.
--   2. Loads the 25 maths questions with their topic, subtopic and difficulty.
--      None of them are in tests yet:
--        draft          Q57-Q71 wait for their A-E options and answer,
--                       Q73-Q76 and Q80 for their answer
--        image-pending  Q72, Q77, Q78, Q79, Q81: image coming soon
--      Both show on the admin page with a flag, and students never see them.
--
-- Safe to run again. Each question is matched on its paper and number
-- (`external_ref`), so a second run updates the same 25 rows rather than
-- adding copies. It only writes the columns above: an answer, options or a
-- picture added since are left as they are. It does set all 25 back to not
-- live, though, so once the next load has made them ready, don't rerun this one.
--
-- Requires migrations 0001-0007 (supabase/run-all.sql) to have been run.

begin;

do $$
begin
  if to_regclass('public.questions') is null then
    raise exception 'No questions table yet. Run supabase/run-all.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Migration 0008: question statuses
-- ---------------------------------------------------------------------------

-- Exampeak: questions that are in the bank but not ready to be asked.
--
-- Run this in the Supabase SQL editor after 0007_profiles_and_google.sql.
--
-- ---------------------------------------------------------------------------
-- Why a question can be unfinished
-- ---------------------------------------------------------------------------
-- The past papers arrive in stages. The question text, topic and difficulty
-- are typed up first; the answer options and the diagrams come later. Until
-- now a question was either in the bank, and so in every test drawn from it,
-- or not in the bank at all. Loading a paper early meant students meeting
-- multiple choice questions with no choices, and diagrams that were not there.
--
-- So a question now has a status, and only a `ready` one is ever put in front
-- of a student:
--
--   draft          typed up, still waiting for its options or its answer
--   image-pending  waiting for its diagram, shown to admins as "image coming soon"
--   ready          complete, and drawn into tests
--
-- Every existing question is `ready`, which is exactly how the app has treated
-- it so far, so nothing a student sees today changes.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The status
-- ---------------------------------------------------------------------------

alter table questions
  add column if not exists status text not null default 'ready';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_status_check'
  ) then
    alter table questions
      add constraint questions_status_check
      check (status in ('draft', 'image-pending', 'ready'));
  end if;
end $$;

-- A ready question has to be one that can be marked: an answer, and for
-- multiple choice at least two options with the answer among them. The API
-- already refuses anything less; this makes it true of rows written straight
-- from the SQL editor too, which is how papers are loaded.
--
-- `not valid` means rows already in the bank are not re-checked, only rows
-- written from now on. Every one of them came through the API's checks, but
-- one that somehow did not should not stop this whole migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_ready_is_complete'
  ) then
    alter table questions
      add constraint questions_ready_is_complete
      check (
        status <> 'ready'
        or (
          btrim(correct_answer) <> ''
          and (
            type <> 'multiple-choice'
            or (jsonb_array_length(options) >= 2 and options ? correct_answer)
          )
        )
      ) not valid;
  end if;
end $$;

comment on column questions.status is
  'draft: waiting for options or answer. image-pending: waiting for its diagram. ready: drawn into tests. Only ready questions reach students.';

-- ---------------------------------------------------------------------------
-- 2. Where a question came from, precisely enough to update it
-- ---------------------------------------------------------------------------
-- A paper is loaded more than once: the questions first, the options and
-- answers later, the diagrams after that. Each load has to find the rows the
-- last one made rather than add a second copy, and prompt text is no key, since
-- it is one of the things a later load may correct.
--
-- `external_ref` names the paper and the question number, for example
-- 'dim-2026-04-12-variant-a:q57'. Questions added in the admin dashboard leave
-- it null; unique still allows any number of nulls.

alter table questions
  add column if not exists external_ref text;

create unique index if not exists questions_external_ref_key
  on questions (external_ref);

comment on column questions.external_ref is
  'Paper and question number, e.g. dim-2026-04-12-variant-a:q57. What a reloaded paper matches on. Null for questions added by hand.';

-- ---------------------------------------------------------------------------
-- 3. The subtopic
-- ---------------------------------------------------------------------------
-- Kept as the paper's own label ("Percentages", "Similar triangles"). Not used
-- to build tests yet, but it is on every row of the question sheet, and a
-- per-subtopic breakdown later needs it recorded now.

alter table questions
  add column if not exists subtopic text;

comment on column questions.subtopic is
  'The paper''s own subtopic label, e.g. "Percentages". Informational for now.';

-- ---------------------------------------------------------------------------
-- 2. The questions
-- ---------------------------------------------------------------------------

-- Rows from an earlier load of this paper that predate external_ref: give them
-- one, so the load below updates them instead of adding duplicates.
update questions
set external_ref = 'dim-2026-04-12-variant-a:q' || substring(source from ', Q([0-9]+)$')
where external_ref is null
  and source like 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q%';

insert into questions as q
  (external_ref, source, subject_id, topic_id, subtopic, difficulty, type, prompt, paper_year, status,
   options, correct_answer)
select v.external_ref, v.source, v.subject_id, v.topic_id, v.subtopic, v.difficulty, v.type, v.prompt,
       v.paper_year, v.status, '[]'::jsonb, ''
from (values
  ('dim-2026-04-12-variant-a:q57', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q57', 'math', 'arithmetic', 'Percentages', 'medium', 'multiple-choice', 'Из 1 тонны медного колчедана, содержащего 2,5% меди, получили 21 кг меди. Сколько процентов меди было потеряно?', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q58', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q58', 'math', 'arithmetic', 'Division algorithm', 'easy', 'multiple-choice', 'Делимое равно 496, неполное частное равно 4, остаток равен 96. Найдите делитель.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q59', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q59', 'math', 'algebra', 'Factorization / difference of squares', 'easy', 'multiple-choice', 'Разложите на множители многочлен (a − 5)² − 16.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q60', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q60', 'math', 'geometry', '3D geometry / cube', 'easy', 'multiple-choice', 'Найдите объём куба, если площадь его полной поверхности равна 24 см².', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q61', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q61', 'math', 'geometry', 'Triangle / medial triangle', 'medium', 'multiple-choice', 'Стороны треугольника равны 16 см, 18 см и 20 см. Найдите периметр треугольника, вершинами которого являются середины сторон данного треугольника.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q62', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q62', 'math', 'geometry', 'Circle circumference', 'easy', 'multiple-choice', 'Найдите радиус окружности, длина которой равна 32π см.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q63', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q63', 'math', 'arithmetic', 'Ratio and proportion', 'easy', 'multiple-choice', 'Число 180 разделили на три части в отношении 1 : 2 : 3. Найдите эти части.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q64', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q64', 'math', 'algebra', 'Substitution into an expression', 'easy', 'multiple-choice', 'Найдите значение выражения −1,5x(−x/3 − 2) при x = −2.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q65', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q65', 'math', 'algebra', 'Quadratic equations / Vieta''s formulas', 'medium', 'multiple-choice', 'Числа −5 и 3 являются корнями уравнения ax² + bx + c = 0. Найдите b/a.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q66', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q66', 'math', 'arithmetic', 'Fractions and powers', 'medium', 'multiple-choice', 'Вычислите (12¾ · 2 − 27) : (−¾)².', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q67', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q67', 'math', 'arithmetic', 'Radicals', 'easy', 'multiple-choice', 'Вычислите √(4 + √25).', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q68', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q68', 'math', 'coordinate-geometry', 'Coordinates of a square', 'medium', 'multiple-choice', 'Найдите на координатной плоскости координаты вершины B квадрата ABCD, если известны A(4; 1), C(2; −1) и D(2; 1).', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q69', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q69', 'math', 'algebra', 'Fractions / reciprocal', 'medium', 'multiple-choice', 'Знаменатель дроби на 1 больше её числителя. Сумма этой дроби и обратной ей дроби равна 2,05. Найдите дробь.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q70', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q70', 'math', 'algebra', 'Simplifying rational expressions', 'easy', 'multiple-choice', 'Упростите выражение (7d + 7c) / (21d + 21c).', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q71', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q71', 'math', 'algebra', 'Powers and signed numbers', 'easy', 'multiple-choice', 'Сравните числа a = (−5)², b = −5² и c = −5.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q72', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q72', 'math', 'geometry', 'Similar triangles', 'medium', 'short-answer', 'Если △ABC ~ △EDF, найдите x.', 2026, 'image-pending'),  -- image coming soon
  ('dim-2026-04-12-variant-a:q73', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q73', 'math', 'algebra', 'Compound inequalities / integer solutions', 'easy', 'short-answer', 'Найдите сумму всех целых решений неравенства −3 ≤ 2x ≤ 11.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q74', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q74', 'math', 'coordinate-geometry', 'Linear equation / coordinates', 'easy', 'short-answer', 'Точка принадлежит графику уравнения 2x + y = 5, её абсцисса равна −4. Найдите её ординату.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q75', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q75', 'math', 'algebra', 'System of equations / algebraic identities', 'medium', 'short-answer', 'Найдите |x − y|, если x² − 7xy + y² = 14 и x² + 3xy + y² = 4.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q76', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q76', 'math', 'number-theory', 'Parity and digit problems', 'medium', 'short-answer', 'Сумма трёхзначного числа 37a и двузначного числа 2b чётна. a и b — цифры, a ≠ b. Найдите наибольшее возможное значение a + b.', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q77', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q77', 'math', 'coordinate-geometry', 'Square / diagonals / area', 'medium', 'short-answer', 'Одна из вершин квадрата ABCD находится в начале координат, K(4; 0) — точка пересечения его диагоналей. Найдите площадь квадрата.', 2026, 'image-pending'),  -- image coming soon
  ('dim-2026-04-12-variant-a:q78', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q78', 'math', 'geometry', 'Angles / angle bisector', 'medium', 'short-answer', 'Прямые AC и BD пересекаются в точке E. ∠CED = 50°, EF — биссектриса угла BEC. Найдите ∠AEF.', 2026, 'image-pending'),  -- image coming soon
  ('dim-2026-04-12-variant-a:q79', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q79', 'math', 'geometry', 'Rectangle / projections / area', 'hard', 'short-answer', 'В прямоугольнике ABCD BM ⟂ AC и DN ⟂ AC. BM = 5 см, площадь треугольника BMN равна 60 см². Найдите AC.', 2026, 'image-pending'),  -- image coming soon
  ('dim-2026-04-12-variant-a:q80', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q80', 'math', 'sets-logic', 'Set counting / inclusion-exclusion', 'medium', 'short-answer', 'В классе 24 ученика получили оценки по физике и химии. Восемь учеников получили неудовлетворительную оценку по физике, а 9 учеников — удовлетворительные оценки по обоим предметам. Сколько учеников получили удовлетворительную оценку только по физике?', 2026, 'draft'),
  ('dim-2026-04-12-variant-a:q81', 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q81', 'math', 'probability', 'Sequential selection without replacement', 'medium', 'short-answer', 'В таблице приведены баллы 26 учеников за экзамен по математике. Одного за другим выбирают двух учеников. Найдите вероятность того, что первый ученик набрал от 70 до 84 баллов, а второй — от 85 до 99 баллов.', 2026, 'image-pending')  -- image coming soon
) as v(external_ref, source, subject_id, topic_id, subtopic, difficulty, type, prompt, paper_year, status)
on conflict (external_ref) do update
set source      = excluded.source,
    subject_id  = excluded.subject_id,
    topic_id    = excluded.topic_id,
    subtopic    = excluded.subtopic,
    difficulty  = excluded.difficulty,
    prompt      = excluded.prompt,
    paper_year  = excluded.paper_year,
    -- Held back until the next load brings the options, answers and pictures.
    status      = excluded.status;

commit;

-- ---------------------------------------------------------------------------
-- Check: 25 rows, 20 draft and 5 image-pending, none of them ready.
-- ---------------------------------------------------------------------------

select status, count(*) as questions, string_agg(replace(external_ref, 'dim-2026-04-12-variant-a:', ''), ', ' order by external_ref) as which
from questions
where external_ref like 'dim-2026-04-12-variant-a:%'
group by status
order by status;
