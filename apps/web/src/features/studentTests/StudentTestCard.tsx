import type { ReactNode } from "react";
import type { Difficulty, TestVisibility } from "@grade9/shared";
import { useLanguage } from "../../lib/i18n";
import { difficultyLabel, subjectLabel } from "../../lib/testText";
import { fill } from "../friends/fill";
import { PersonLabel } from "../friends/PersonLabel";
import type { FriendPerson } from "@grade9/shared";

/** What a card needs of a test, whether the owner's full copy or a list's summary. */
export interface CardTest {
  id: string;
  title: string;
  subjectId: string;
  difficulty: Difficulty;
  visibility: TestVisibility;
  timeLimitMinutes: number | null;
  questionCount: number;
  author?: FriendPerson;
}

/**
 * One student-made test in a list: its title, what it is (subject, level,
 * size, time), who may take it, who made it when that is not the reader, and
 * the actions the list offers.
 */
export function StudentTestCard({ test, actions, showVisibility = false }: {
  test: CardTest;
  actions: ReactNode;
  /** The owner's own list says who can take each test; other lists need not. */
  showVisibility?: boolean;
}) {
  const { t, tn } = useLanguage();

  return (
    <article className="student-test-card" data-level={test.difficulty}>
      <div className="student-test-card-main">
        <h3 className="student-test-title">{test.title}</h3>
        <p className="student-test-meta">
          <span>{subjectLabel(t, test.subjectId)}</span>
          <span className="level-tag" data-level={test.difficulty}>
            {difficultyLabel(t, test.difficulty)}
          </span>
          <span>{tn("count.questions", test.questionCount)}</span>
          <span>{test.timeLimitMinutes === null ? t("mytests.untimed") : tn("count.minutes", test.timeLimitMinutes)}</span>
          {showVisibility && (
            <span className={`student-test-visibility visibility-${test.visibility}`}>
              {test.visibility === "public" ? t("mytests.visibilityPublic") : t("mytests.visibilityFriends")}
            </span>
          )}
        </p>
        {test.author && (
          <div className="student-test-author" aria-label={fill(t("mytests.by"), { name: test.author.fullName })}>
            <PersonLabel person={test.author} size={28} />
          </div>
        )}
      </div>
      <div className="student-test-actions">{actions}</div>
    </article>
  );
}
