import { useState } from "react";
import type { Friend, FriendProgress } from "@grade9/shared";
import { formatDay, useLanguage } from "../../lib/i18n";
import { fill } from "./fill";
import { PersonLabel } from "./PersonLabel";

/** Nothing to show yet, as opposed to a figure of zero. */
const NONE = "-";

/**
 * The accepted friends, each with their figures set beside the student's own.
 *
 * Deliberately a comparison between two people and not a ranking of everyone:
 * the friends are listed by name, and no figure is marked as winning.
 */
export function FriendsList({
  friends,
  me,
  busyId,
  onRemove
}: {
  friends: Friend[];
  me: FriendProgress;
  busyId: string | null;
  onRemove: (friendshipId: string) => Promise<void>;
}) {
  const { t } = useLanguage();

  return (
    <section className="panel friends-panel" aria-labelledby="friends-list-title">
      <h2 id="friends-list-title">{t("friends.listTitle")}</h2>

      {friends.length === 0 ? (
        <p className="panel-hint">{t("friends.empty")}</p>
      ) : (
        <ul className="friends-list">
          {friends.map((friend) => (
            <li key={friend.friendshipId}>
              <FriendCard friend={friend} me={me} busy={busyId !== null} onRemove={onRemove} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FriendCard({
  friend,
  me,
  busy,
  onRemove
}: {
  friend: Friend;
  me: FriendProgress;
  busy: boolean;
  onRemove: (friendshipId: string) => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  async function confirmRemove() {
    await onRemove(friend.friendshipId);
    // Still here means it did not go (it was out of date, or failed): back to the card as it was.
    setConfirming(false);
  }

  const day = (iso: string | null) => (iso ? formatDay(iso, language) : NONE);
  const best = (progress: FriendProgress) =>
    progress.best ? `${progress.best.score}/${progress.best.totalMarks} (${progress.best.percentage}%)` : NONE;
  const average = (progress: FriendProgress) =>
    progress.averagePercentage === null ? NONE : `${progress.averagePercentage}%`;

  const rows: Array<{ label: string; mine: string; theirs: string }> = [
    { label: t("friends.testsTaken"), mine: String(me.testsTaken), theirs: String(friend.progress.testsTaken) },
    { label: t("friends.bestScore"), mine: best(me), theirs: best(friend.progress) },
    { label: t("friends.average"), mine: average(me), theirs: average(friend.progress) },
    { label: t("friends.lastActive"), mine: day(me.lastActiveAt), theirs: day(friend.progress.lastActiveAt) }
  ];

  return (
    <article className="friend-card">
      <header className="friend-card-head">
        <PersonLabel person={friend} />
        <p className="friend-since">
          {t("friends.since")} {formatDay(friend.since, language)}
        </p>
      </header>

      <table className="friend-compare">
        <caption>{fill(t("friends.compareCaption"), { name: friend.fullName })}</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">{t("friends.you")}</th>
            <th scope="col" title={friend.fullName}>
              {friend.fullName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.mine}</td>
              <td>{row.theirs}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirming ? (
        // Asked here, on the card, rather than in a browser dialog: it names the
        // person, reads in the site language, and works the same on a phone.
        <div className="friend-confirm" role="group" aria-label={friend.fullName}>
          <p>{fill(t("friends.removeConfirm"), { name: friend.fullName })}</p>
          <div className="friend-confirm-actions">
            <button
              type="button"
              className="danger-button danger-solid"
              disabled={busy}
              onClick={confirmRemove}
            >
              {t("friends.removeYes")}
            </button>
            <button type="button" className="ghost-button" autoFocus disabled={busy} onClick={() => setConfirming(false)}>
              {t("friends.removeNo")}
            </button>
          </div>
        </div>
      ) : (
        <div className="friend-card-foot">
          <button type="button" className="danger-button" disabled={busy} onClick={() => setConfirming(true)}>
            {t("friends.remove")}
          </button>
        </div>
      )}
    </article>
  );
}
