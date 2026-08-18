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
| `explanation`    | no       | Why the answer is right. Shown to the student after the test. |
| `image_url`      | no       | Link to a diagram. Leave blank and attach the picture through the admin form instead. |
| `paper_year`     | no       | e.g. `2024`.                                                |
| `source`         | no       | e.g. `2024 final paper 1`.                                  |

Header names are matched loosely, so `Question`, `question` and `question_text`
all work, as do `A` for `option_a` and `answer` for `correct_answer`. Column
order does not matter.

## Example

```csv
subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct_answer,explanation,paper_year
math,algebra,easy,Solve for x: 2x + 6 = 14,x = 2,x = 4,x = 5,x = 8,B,Subtract 6 from both sides to get 2x = 8then divide by 2.,2024
english,grammar,medium,Choose the correct form: She ___ to school every day.,go,goes,going,gone,B,Third person singular in the present simple takes -s.,2024
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
