# Question spreadsheet format

Set the Google Sheet up with these column headers and the whole thing can be
imported in one paste, rather than typed into the form question by question.

## Columns

| Column           | Required | Notes                                                       |
| ---------------- | -------- | ----------------------------------------------------------- |
| `subject`        | yes      | `math`, `english` or `russian`                              |
| `topic`          | yes      | Free text, e.g. `algebra`. Spaces become dashes.            |
| `difficulty`     | no       | `easy`, `medium` or `hard`. Defaults to `medium` if blank.  |
| `type`           | no       | `multiple-choice` or `short-answer`. Worked out from whether options are filled in if blank. |
| `question`       | yes      | The question text, exactly as on the paper.                 |
| `option_a`       | for MCQ  | First option.                                               |
| `option_b`       | for MCQ  | Second option. At least two options are needed.             |
| `option_c`       | no       | Third option.                                               |
| `option_d`       | no       | Fourth option.                                              |
| `correct_answer` | yes      | The letter (`A`, `B`, `C`, `D`) or the full answer text.    |
| `marks`          | no       | What the question is worth, e.g. `3`. A whole number from 1 to 100. Defaults to `1` if blank. |
| `explanation`    | no       | Why the answer is right. Shown to the student after the test. |
| `image_url`      | no       | Link to a diagram. Leave blank and attach the picture through the admin form instead. |
| `paper_year`     | no       | e.g. `2024`.                                                |
| `source`         | no       | e.g. `2024 final paper 1`.                                  |

Header names are matched loosely, so `Question`, `question` and `question_text`
all work, as do `A` for `option_a`, `answer` for `correct_answer`, and `points`
for `marks`. Column order does not matter.

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

## Rows that are skipped

A row is reported and skipped, with the rest of the paste still importing, when
`subject`, `topic`, `question` or `correct_answer` is empty, when a
multiple-choice row has fewer than two options, when `correct_answer` matches
none of them, or when `difficulty` or `marks` is filled in with something
unusable. Subject and topic are checked per row, not just as columns: the
builder filters on both, so a question missing either could never appear in a
test.

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

1. In Google Sheets: **File → Download → Comma-separated values**.
2. Open the downloaded file in a text editor and copy everything, header row
   included.
3. In the app go to **Admin dashboard → Bulk import**, paste, and press
   **Import questions**.

Rows that do not validate are reported back with their spreadsheet row number and
skipped. The rest still import, so one bad cell does not block the other forty.

## Pictures

Questions with diagrams are the fiddly ones. Two options:

- Crop the image, upload it somewhere reachable, and put the link in `image_url`.
- Leave `image_url` empty, import the row, then find the question in
  **All questions**, press **Edit** and attach the picture there. This is usually
  easier for a handful of questions.
