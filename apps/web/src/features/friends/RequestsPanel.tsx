import type { FriendRequest } from "@grade9/shared";
import { useLanguage } from "../../lib/i18n";
import { PersonLabel } from "./PersonLabel";

/**
 * Requests waiting on somebody: the ones to answer, and the ones sent.
 *
 * Nothing is shown of the other student beyond their name, username and photo.
 * A request is not a friendship, so their progress stays private until it is
 * accepted.
 */
export function RequestsPanel({
  incoming,
  outgoing,
  busyId,
  onAccept,
  onDecline,
  onCancel
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** The request being acted on, whose buttons are held until it comes back. */
  busyId: string | null;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onCancel: (requestId: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <>
      {incoming.length > 0 && (
        <section className="panel friends-panel" aria-labelledby="friends-incoming-title">
          <h2 id="friends-incoming-title">{t("friends.incomingTitle")}</h2>

          <ul className="friends-request-list">
            {incoming.map((request) => (
              <li key={request.requestId} className="friends-request">
                <PersonLabel person={request} />

                <div className="friends-request-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busyId !== null}
                    onClick={() => onAccept(request.requestId)}
                  >
                    {t("friends.accept")}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busyId !== null}
                    onClick={() => onDecline(request.requestId)}
                  >
                    {t("friends.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="panel friends-panel" aria-labelledby="friends-outgoing-title">
          <h2 id="friends-outgoing-title">{t("friends.outgoingTitle")}</h2>

          <ul className="friends-request-list">
            {outgoing.map((request) => (
              <li key={request.requestId} className="friends-request">
                <PersonLabel person={request} />

                <div className="friends-request-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busyId !== null}
                    onClick={() => onCancel(request.requestId)}
                  >
                    {t("friends.cancel")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
