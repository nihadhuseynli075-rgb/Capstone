import { useEffect, useRef, useState } from "react";
import {
  templateAiInstruction,
  templateColumns,
  templateCsv,
  templateFileName,
  templateLayout,
  templateSubjectName,
  type TemplateSubjectId
} from "../lib/importTemplate";

const SUBJECT_IDS: TemplateSubjectId[] = ["math", "english", "russian", "azerbaijani"];

/**
 * The template card at the top of Bulk import: pick a subject, download its
 * template, or copy an instruction for an AI tool that turns an own sheet into
 * the template's layout. Everything is built in the browser, so it works
 * without the API and in memory mode alike.
 */
export function ImportTemplate() {
  const [subjectId, setSubjectId] = useState<TemplateSubjectId>("math");
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  function download() {
    const blob = new Blob([templateCsv(subjectId)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFileName(subjectId);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked a moment later: some browsers start the download only after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyInstruction() {
    window.clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(templateAiInstruction(subjectId));
      setCopied("done");
    } catch {
      // Clipboard access is refused on plain http other than localhost, and in some embedded browsers.
      setCopied("failed");
    }
    resetTimer.current = window.setTimeout(() => setCopied(null), 4000);
  }

  return (
    <div className="import-template">
      <div className="import-template-head">
        <div>
          <h3>Start from the template</h3>
          <p className="panel-hint">
            Azerbaijani Language uses the one-table layout (an Option A to E column each). English, Maths
            and Russian use the 12 and 26 April layout (all options in one Answer Options cell). Download a
            template to see example rows, fill it in (or have an AI tool convert your own sheet into it),
            export it as CSV and drop it below.
          </p>
        </div>
      </div>

      <div className="chip-row" role="radiogroup" aria-label="Template subject">
        {SUBJECT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={subjectId === id}
            className={`chip${subjectId === id ? " selected" : ""}`}
            onClick={() => {
              setSubjectId(id);
              setCopied(null);
            }}
          >
            {templateSubjectName(id)}
          </button>
        ))}
      </div>

      <div className="import-template-actions">
        <button type="button" className="primary-button" onClick={download}>
          Download {templateSubjectName(subjectId)} template (.csv)
        </button>
        <button type="button" className="ghost-button" onClick={() => void copyInstruction()}>
          Copy instructions for AI
        </button>
        <span className="import-template-copied" role="status">
          {copied === "done" && "Copied. Paste it into your AI tool with your sheet and the template."}
          {copied === "failed" && "Could not copy here. Open the column guide below instead."}
        </span>
      </div>

      <div className="import-template-passage">
        <strong>One passage, several questions.</strong> Write the same <code>Passage Title</code> on every
        question about the text, and put the text itself in{" "}
        <code>Passage / Text Related to the Question</code> on the first of them. Number the questions so they
        keep the paper's order. The language templates show one passage with three questions.
      </div>

      <details className="import-template-columns">
        <summary>
          What each column means ({templateLayout(subjectId).id === "one-table" ? "one-table layout" : "Answer Options layout"})
        </summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Holds</th>
            </tr>
          </thead>
          <tbody>
            {templateColumns(subjectId).map((column) => (
              <tr key={column.header}>
                <td>
                  <code>{column.header}</code>
                  {column.required && <span className="import-template-required"> required</span>}
                </td>
                <td>{column.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
