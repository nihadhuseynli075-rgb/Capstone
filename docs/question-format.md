# Question spreadsheet format

Set the Google Sheet up with these column headers and the whole thing can be
imported in one paste, rather than typed into the form question by question.

## Columns

| Column           | Required | Notes                                                       |
| ---------------- | -------- | ----------------------------------------------------------- |
| `subject`        | yes      | `math`, `english`, `russian` or `azerbaijani` (see below)   |
| `topic`          | yes      | A topic's id or name, e.g. `functions` or `Functions and Graphs`. Anything new becomes a new topic, with spaces turned into dashes. |
| `difficulty`     | no       | `easy`, `medium` or `hard`. Defaults to `medium` if blank.  |
| `type`           | no       | `multiple-choice`, `short-answer`, or `open-ended` for a written answer marked by the AI marker (put its marking guide in `correct_answer`). Worked out from whether options are filled in if blank. |
| `question`       | yes      | The question text, exactly as on the paper.                 |
| `option_a`       | for MCQ  | First option.                                               |
| `option_b`       | for MCQ  | Second option. At least two options are needed.             |
| `option_c`       | no       | Third option.                                               |
| `option_d`       | no       | Fourth option.                                              |
| `option_e`       | no       | Fifth option. DİM papers have five (A to E), so leave it in for them. |
| `correct_answer` | yes      | The letter (`A` to `E`, in capitals or not) or the full answer text.    |
| `marks`          | no       | What the question is worth, e.g. `3`. A whole number from 1 to 100. Defaults to `1` if blank. |
| `explanation`    | no       | Why the answer is right. Shown to the student after the test. |
| `image_url`      | no       | A full link to the diagram, starting with `https://`. Leave blank and attach the picture through the admin form instead (see [Pictures](#pictures)). |
| `paper_year`     | no       | e.g. `2024`.                                                |
| `source`         | no       | e.g. `2024 final paper 1`.                                  |

Header names are matched loosely, so `Question`, `question` and `question_text`
all work, as do `A` for `option_a`, `answer` for `correct_answer`, and `points`
for `marks`. Column order does not matter.

## Subjects and topics

Only the site's four subjects can be imported. The cell is matched without
regard to case, by id or by name, and these spellings are accepted too:

| Subject   | Accepted                                                               |
| --------- | ---------------------------------------------------------------------- |
| `math`    | `Mathematics`, `Maths`, `Математика`, `Riyaziyyat`                     |
| `english` | `English`, `English Language`, `Английский язык`, `İngilis dili`       |
| `russian` | `Russian`, `Russian Language`, `Русский язык`, `Rus dili`              |
| `azerbaijani` | `Azerbaijani`, `Azerbaijani Language`, `Азербайджанский язык`, `Azərbaycan dili` |

Any other subject (`physics`, say) skips that row with an error naming the row
and the value. It is not stored as a subject of its own, because that would put
a stray subject in the student's test builder that no admin filter reaches.

A topic that matches one of the subject's topics by name or id is stored under
that topic's id: `Functions and Graphs` and `functions` are both `functions`.
A topic the subject does not have yet is still accepted and becomes a new topic
(`Word Problems` is `word-problems`).

## Marks

A score is out of the marks available, not the number of questions, so a
three-mark question earned counts for three times a one-mark question. Leave the
column out entirely and every question is worth one mark, which scores exactly
the way it did before the column existed.

Put the number the paper prints in brackets at the end of a question. If a
question is out of 3, put `3`; do not split it into three rows. Marking itself
is still all or nothing per question - a right answer takes the marks, a wrong
one takes none - so a question worth 3 cannot currently be given 2.

A value that is not a whole number from 1 to 100 is reported as a bad row rather
than rounded to something plausible, because a cell that landed in the wrong
column would otherwise weight one question above the rest of the paper.

## Translations (maths)

Maths is shown in the language the student chose for the site, so a maths
question can carry its text in more than one language. English, Russian and
Azerbaijani Language questions never do: they are always in their own language, and translation
columns on those rows are reported as a bad row rather than saved and ignored.

The columns above are the question as first written (for maths, English). A
translation is a second set of columns with the same names and `_ru` or `_en` on
the end (`_ru`, `_en` or `_az`). All of them are optional, and a row that leaves them blank simply has
no translation.

| Column                                         | Notes                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `question_ru` / `question_en`                  | The question text in that language. Required if any other column for that language is filled in. |
| `option_a_ru` ... `option_e_ru` (and `_en`)    | The options in that language, **in the same order as `option_a` ... `option_e`**. |
| `explanation_ru` / `explanation_en`            | The explanation in that language.                                     |
| `correct_answer_ru` / `correct_answer_en`      | Short answers only, and only when the answer reads differently (`26 cm` and `26 см`). Ignored on multiple choice. |

The headers are matched as loosely as the others: `question_ru`,
`question_russian` and `Question (Russian)` are the same column, and so are
`option_a_ru` and `Option A (Russian)`.

How a translation is used:

- A student gets a maths question in the translation for their language if it
  has one, and in the question's own text otherwise. Azerbaijani has no
  translations yet, so those students get the question's own text.
- A multiple-choice answer is the option **in the same position**, so
  `option_b_ru` is the translation of `option_b` and the `correct_answer` letter
  covers every language. Give a language either all of its options or none; a
  row whose translated options are not one for one with the originals is
  reported and skipped.
- Leave a language's options out and its question text is translated while the
  options stay as they are.

```csv
subject,topic,question,option_a,option_b,option_c,option_d,correct_answer,question_ru,option_a_ru,option_b_ru,option_c_ru,option_d_ru
math,geometry,Find the radius of a circle whose circumference is 32π cm.,8 cm,16 cm,32 cm,64 cm,B,"Найдите радиус окружности, длина которой равна 32π см.",8 см,16 см,32 см,64 см
```

If the sheet has no plain `question` column but does have `question_en` (for
example `Question (English)` next to `Question (Russian)`), the English columns
are taken as the question itself and only the Russian ones become a translation.

## Rows that are skipped

A row is reported and skipped, with the rest of the paste still importing, when
`subject`, `topic`, `question` or `correct_answer` is empty, when `subject` is
not one of the four subjects (a new subject would appear in front of students
with no way to filter it in the dashboard), when a
multiple-choice row has fewer than two options, when `correct_answer` matches
none of them, when `difficulty` or `marks` is filled in with something
unusable, or when `image_url` is not a full `https://` link. Subject and topic
are checked per row, not just as columns: the builder filters on both, so a
question missing either could never appear in a test. A translation that does
not fit its question (the wrong number of
options, translated options with no question text, or a subject that does not
follow the site language) skips the row too.

## Example

```csv
subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct_answer,marks,explanation,paper_year
math,algebra,easy,Solve for x: 2x + 6 = 14,x = 2,x = 4,x = 5,x = 8,B,1,Subtract 6 from both sides to get 2x = 8then divide by 2.,2024
math,algebra,hard,Factorise fully: 2x^2 + 7x + 3,,,,,(2x+1)(x+3),3,Look for two numbers multiplying to 6 and adding to 7.,2024
english,grammar,medium,Choose the correct form: She ___ to school every day.,go,goes,going,gone,B,1,Third person singular in the present simple takes -s.,2024
```

A short-answer question just leaves the option columns empty and puts the
answer itself in `correct_answer`.

## Importing

1. In Google Sheets: **File → Download → Comma-separated values**
   (or **Tab-separated values**, which imports just the same). A CSV saved
   from Excel imports too, including one with semicolons between the columns,
   which is how Excel saves it wherever the comma is the decimal mark
   (Azerbaijani and Russian Windows, for example). Which separator a sheet
   uses is read from its header row. In Excel, save it as
   **CSV UTF-8 (Comma delimited)**: the plain **CSV (Comma delimited)** type
   writes Azerbaijani and Russian letters in an older encoding, and the
   dashboard refuses such a file rather than import every one of them as "�".
2. In the app go to **Admin dashboard → Bulk import** and drag the downloaded
   `.csv` or `.tsv` file onto the drop zone, or use **choose a file**. It fills
   the box below, so you can check it. (Opening the file in a text editor,
   copying everything, header row included, and pasting works as well.)
3. Press **Import questions**.

A quote mark inside a cell, as in `A 12" ruler`, is kept as part of the text.
Only a cell that starts with a quote is read as a quoted cell, which is how
spreadsheets export a cell holding commas, semicolons, tabs or line breaks.

Rows that do not validate are reported back with their spreadsheet row number and
skipped. The rest still import, so one bad cell does not block the other forty.

Quotes inside a cell are fine: `The word "happy" means?` or `He is 6' 2" tall`
import exactly as typed. A cell is only treated as quoted when it starts with a
quote, which is how Google Sheets writes cells that hold a comma, tab or line
break. If a file ends inside an unclosed quote, the import says which row the
quote opened on instead of quietly merging the rows after it.

## Importing Nihad's workbook

The DİM workbook (`DIM_2026_AZ_ACTUAL_QUESTIONS_COMPLETE_AS_PROVIDED.xlsm`) can
be imported without renaming a single column. Its headers are recognised as
they are: `Q#`, `Subject`, `Topic`, `Subtopic`, `Question (original AZ)`,
`Difficulty`, `Answer Options (full)`, `Correct Answer (DİM)`, `Date`, `Sector`,
`Variant`, `Passage ID`, `Passage Title`, `Passage (separate column)` and `A` to
`E`. Columns the import has no use for (`Status`, `Key Check`, `Image / Page`,
`Notes / exactness` and the like) are ignored.

**Which sheets to export.** Export each sheet as its own **CSV UTF-8**, from
Excel or Google Sheets, and drop them on **Admin dashboard → Bulk import** one
after another:

1. **Reading texts** first. It is recognised by its header (`ID текста`,
   `Название`, `Полный текст / перепечатка`, or in English `passage_id`,
   `title`, `text`) and saved as reading passages, one per row, kept under their
   id (`05-P1`). Sending it again updates the passages instead of adding copies.
2. **Questions** next (or a per-paper sheet such as `05 Apr C`, which has the
   same columns). Use one or the other, not both: they hold the same questions.

Only the first sheet of a workbook is exported by a CSV download, so repeat the
download for each sheet.

**What the columns become.**

- `Topic`: a leading subject name is dropped (`Azərbaycan dili / Qrammatika` is
  Grammar), and the Azerbaijani and Russian names map to the usual topics:
  Qrammatika is `grammar`, `Oxu / Mətn` and Mətn are `reading`, Leksika is
  `vocabulary`, Orfoqrafiya is `spelling`, Durğu işarələri is `punctuation`,
  Fonetika is `phonetics`, Yazı is `writing`, `Sets & Logic` is `sets-logic`
  and `Probability` is `probability`. A topic that is only the subject's own
  name (`Riyaziyyat` under Mathematics) goes into one topic called `general`.
  `Subtopic` is kept as the question's subtopic.
- `Difficulty`: `1`, `2`, `3` (Excel writes `1.0`) are easy, medium and hard.
  Blank is medium.
- `Date`, `Sector`, `Variant` and `Q#` give the question's source
  (`DİM 05.04.2026, AZ sector, Variant C, Q37`), its paper year, and a key
  (`dim-2026-04-05-az-c:q37`). **Because of that key, sending the same sheet
  again updates the questions already in the bank rather than adding copies**,
  so a sheet can be fixed and imported as often as needed. Without those
  columns the old `source` column is used and a repeat of the same question text
  is skipped, as before.
- `Answer Options (full)` fills the options only when `A` to `E` are empty and
  the text is a clean list (`A) …` on separate lines, starting at A). It also
  tells a written answer (`Yazılı açıq cavab`, `open-ended`) and a short answer
  from a multiple choice question.

**Drafts.** The Bulk import page keeps a row that is not finished yet as a
**draft** (shown in the admin list, never put in a test) instead of skipping
it, and lists each one with the reason: no options yet, key not published,
written answer without a marking guide, a key letter pointing at an empty
option, the passage not in the bank yet. A draft needs at least a subject, a
topic and the question text. Fill in what is missing in the sheet and import it
again (the key updates the draft), or finish it in the admin form. Through the
API this is the `keepDrafts: true` flag on `POST /api/admin/questions/import`;
left out, an unfinished row is skipped and reported as before.

**Excel and the answer `1,4`.** Excel turns an answer typed as `1,4` into the
number `1.4` (and `1,5` into `1.5`). Those rows are never guessed at: they come
in as drafts saying "Excel turned the answer 1,4 into 1.4; check the key". Fix
the key in the sheet (format the column as Text before typing, or put an
apostrophe in front) and import again.

**Passages.** A question row with a `Passage ID` is linked to that passage and
shown with it, in the order of the `Q#` numbers on it. If the row also carries
`Passage Title` and the text (`Passage (separate column)`), the first such row
creates or updates the passage, so the Reading texts sheet is optional when the
questions sheet has the texts. A question whose passage is not in the bank and
has no text on its row becomes a draft ("passage 05-P1 not in the bank yet;
import the Reading texts sheet"), because it cannot be answered without it. A
Reading texts sheet with no subject column is saved as Azerbaijani, English or
Russian by reading the text itself; a passage already in the bank keeps its
subject.

**Several correct answers.** Put `multiple-select` (or `multi`, `select-all`,
`multiple answers`) in the `type` column and list the letters in
`correct_answer`: `A, D`, `A;D` and `AD` all tick options A and D. Students must
tick exactly those. This is never worked out from the workbook, so a `Correct
Answer (DİM)` of `1.4` is not treated as two answers.

**Azerbaijani translations.** The translation columns for maths also take
`_az`, `_azerbaijani` or `(Azerbaijani)` on the end, next to `_ru` and `_en`:
`question_az`, `option_a_az`, `Question (Azerbaijani)`. Like the others they are
for maths only; on other subjects they are reported as a bad row.

## Pictures

Questions with diagrams are the fiddly ones. Two options:

- Leave `image_url` empty, import the row, then find the question in
  **All questions**, press **Edit** and attach the picture there. The picture
  goes into the project's own storage. This is usually the easier way, and the
  only one for a picture that is a file on your computer.
- Crop the image, put it online somewhere anyone can open it, and put its full
  link in `image_url`: `https://` followed by the address of the picture itself
  (it opens as just the picture in a browser), not of a page that shows it.

A file name such as `diagram1.png` is not a link, so a row with one (or with a
link that does not start with `https://`) is reported and skipped rather than
imported with a picture students would see broken. Links into the project's own
Supabase storage are taken as they are.

For a written (open-ended) question, the AI marker is sent the picture too.
The API fetches it only from the project's storage or from an `https://`
address on the public internet, never from an address inside a private
network, and only a picture of at most 5 MB, served as an image and without a
redirect. A picture it cannot fetch leaves the written answer unmarked rather
than marked without it, so check that the link opens the picture itself.
