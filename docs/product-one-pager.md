# ExamPeak - Product One Pager

## Vision

A website that generates mock tests for Grade 9 final examinations from real
past-paper questions. Students practise exam-style questions, find out which
topics are letting them down, and prepare from home.

The name works two ways: **Exam** as a book, **Peak** as a mountain. The logo is
both at once.

## Problem

Grade 9 students struggle to find enough practice questions that match their
syllabus and exam format. Worksheets are repetitive, often outdated, and give no
feedback. Getting more practice usually means extra classes or travelling to a
learning centre.

ExamPeak lets a student build a test to their own settings, sit it, and
understand every mistake, without leaving home.

## Users

Grade 9 students preparing for final exams, in Mathematics, English and Russian.

They use the site to practise exam questions, review topics, see where they are
weak, and get results and explanations immediately.

## How a test works

The student picks a subject and one or more topics, then either:

- **A difficulty** - easy, medium or hard, each of which sets the number of
  questions and the time limit for them, or
- **Custom** - they choose the number of questions and the timer themselves, or
  turn the timer off entirely.

It is one or the other. Choosing a difficulty and separately choosing a question
count and timer would be three controls for the same decision.

The test then runs exam-style: all questions first, nothing revealed until the
whole paper is submitted. At the end the student sees their score, which
questions they got wrong, the correct answer, an explanation for each, a
breakdown by topic, and how the result compares to their best test so far.

## Where questions come from

Questions are entered by an admin, not generated. Past papers are compiled into a
spreadsheet, then either imported in one paste or typed into a form in the admin
dashboard. Every question carries its subject, topic, difficulty, options,
correct answer, explanation, and optionally a diagram and the paper year.

Keeping entry behind the admin dashboard is what keeps the data consistent enough
to generate a sensible test from.

## Built

- Admin dashboard: sign-in, add, edit, delete, and spreadsheet import
- Question bank with subject, topic, difficulty and paper metadata
- Test builder with difficulty presets and a custom mode
- Exam interface with a timer that submits automatically when it runs out
- Automatic marking, per-question explanations, topic breakdown
- Test history and a best-result comparison
- Light and dark mode

## Next

- Registration and login, so history follows the student rather than the browser
- Friends: a friend list, and comparing progress against them
- A community board where students post questions for each other, possibly
  unlocked by scoring full marks as a reward
- A domain, once the project is mostly finished

## Measure of success

A student can sit a mock test, see exactly which topics they are weak in, and
come back to a second test that shows they improved.
