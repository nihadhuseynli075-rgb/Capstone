-- Maths, DİM Grade 9, Russian sector, Variant A, 12 April 2026: Q57-Q81 in Russian.
--
-- Paste into the Supabase SQL editor and run. Safe to run twice: a question
-- already in the bank (matched on `source`) is skipped, not duplicated.
--
-- 20 of the 25 maths questions, all short answer. The sheet has only the
-- correct option for each A-E question, so they are entered as the value the
-- student types. Q59, Q63, Q66, Q68, Q71 are left out until their five
-- options are in the sheet: their answers cannot be typed to match exactly.
--
-- Q72, Q77, Q78, Q79, Q81 have pictures, attached separately by
-- 02-maths-images.sql. Q72 and Q81 cannot be answered until theirs is there.

do $$
begin
  if to_regclass('public.questions') is null then
    raise exception 'No questions table yet. Run supabase/run-all.sql first.';
  end if;
end $$;

insert into questions
  (source, subject_id, topic_id, difficulty, type, prompt, options, correct_answer, explanation, paper_year)
select v.source, v.subject_id, v.topic_id, v.difficulty, 'short-answer', v.prompt, '[]'::jsonb,
       v.correct_answer, v.explanation, v.paper_year
from (values
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q57', 'math', 'arithmetic', 'medium', 'Из 1 тонны медного колчедана, содержащего 2,5% меди, получили 21 кг меди. Сколько процентов меди было потеряно? Запишите в ответ только число.', '16', 'Ответ: 16%.', 2026),  -- Q57
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q58', 'math', 'arithmetic', 'easy', 'Делимое равно 496, неполное частное равно 4, остаток равен 96. Найдите делитель.', '100', '', 2026),  -- Q58
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q60', 'math', 'geometry', 'easy', 'Найдите объём куба, если площадь его полной поверхности равна 24 см². Запишите в ответ только число.', '8', 'Ответ: 8 см³.', 2026),  -- Q60
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q61', 'math', 'geometry', 'medium', 'Стороны треугольника равны 16 см, 18 см и 20 см. Найдите периметр треугольника, вершинами которого являются середины сторон данного треугольника. Запишите в ответ только число.', '27', 'Ответ: 27 см.', 2026),  -- Q61
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q62', 'math', 'geometry', 'easy', 'Найдите радиус окружности, длина которой равна 32π см. Запишите в ответ только число.', '16', 'Ответ: 16 см.', 2026),  -- Q62
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q64', 'math', 'algebra', 'easy', 'Найдите значение выражения −1,5x(−x/3 − 2) при x = −2.', '-4', '', 2026),  -- Q64
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q65', 'math', 'algebra', 'medium', 'Числа −5 и 3 являются корнями уравнения ax² + bx + c = 0. Найдите b/a.', '2', '', 2026),  -- Q65
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q67', 'math', 'arithmetic', 'easy', 'Вычислите √(4 + √25).', '3', '', 2026),  -- Q67
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q69', 'math', 'algebra', 'medium', 'Знаменатель дроби на 1 больше её числителя. Сумма этой дроби и обратной ей дроби равна 2,05. Найдите дробь. Ответ запишите обыкновенной дробью, например 2/3.', '4/5', '', 2026),  -- Q69
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q70', 'math', 'algebra', 'easy', 'Упростите выражение (7d + 7c) / (21d + 21c). Ответ запишите обыкновенной дробью, например 2/3.', '1/3', '', 2026),  -- Q70
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q72', 'math', 'geometry', 'medium', 'Если △ABC ~ △EDF, найдите x.', '4', '', 2026),  -- Q72 (has a picture)
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q73', 'math', 'algebra', 'easy', 'Найдите сумму всех целых решений неравенства −3 ≤ 2x ≤ 11.', '14', '', 2026),  -- Q73
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q74', 'math', 'coordinate-geometry', 'easy', 'Точка принадлежит графику уравнения 2x + y = 5, её абсцисса равна −4. Найдите её ординату.', '13', '', 2026),  -- Q74
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q75', 'math', 'algebra', 'medium', 'Найдите |x − y|, если x² − 7xy + y² = 14 и x² + 3xy + y² = 4.', '3', '', 2026),  -- Q75
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q76', 'math', 'number-theory', 'medium', 'Сумма трёхзначного числа 37a и двузначного числа 2b чётна. a и b — цифры, a ≠ b. Найдите наибольшее возможное значение a + b.', '16', '', 2026),  -- Q76
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q77', 'math', 'coordinate-geometry', 'medium', 'Одна из вершин квадрата ABCD находится в начале координат, K(4; 0) — точка пересечения его диагоналей. Найдите площадь квадрата.', '32', '', 2026),  -- Q77 (has a picture)
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q78', 'math', 'geometry', 'medium', 'Прямые AC и BD пересекаются в точке E. ∠CED = 50°, EF — биссектриса угла BEC. Найдите ∠AEF. Запишите в ответ только число.', '115', 'Ответ: 115°.', 2026),  -- Q78 (has a picture)
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q79', 'math', 'geometry', 'hard', 'В прямоугольнике ABCD BM ⟂ AC и DN ⟂ AC. BM = 5 см, площадь треугольника BMN равна 60 см². Найдите AC. Запишите в ответ только число.', '26', 'Ответ: 26 см.', 2026),  -- Q79 (has a picture)
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q80', 'math', 'sets-logic', 'medium', 'В классе 24 ученика получили оценки по физике и химии. Восемь учеников получили неудовлетворительную оценку по физике, а 9 учеников — удовлетворительные оценки по обоим предметам. Сколько учеников получили удовлетворительную оценку только по физике?', '7', '', 2026),  -- Q80
  ('DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q81', 'math', 'probability', 'medium', 'В таблице приведены баллы 26 учеников за экзамен по математике. Одного за другим выбирают двух учеников. Найдите вероятность того, что первый ученик набрал от 70 до 84 баллов, а второй — от 85 до 99 баллов. Ответ запишите обыкновенной дробью, например 2/3.', '1/5', '', 2026)  -- Q81 (has a picture)
) as v(source, subject_id, topic_id, difficulty, prompt, correct_answer, explanation, paper_year)
where not exists (select 1 from questions q where q.source = v.source);

-- What is in the bank for this paper now.
select topic_id, difficulty, count(*)
from questions
where source like 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q%'
group by topic_id, difficulty
order by topic_id, difficulty;
