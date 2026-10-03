import type { FriendPerson } from "@grade9/shared";
import { Avatar } from "../profile/Avatar";

/** A student as the friends page shows them: photo, name, and their @username under it. */
export function PersonLabel({ person, size = 40 }: { person: FriendPerson; size?: number }) {
  return (
    <div className="friends-person">
      <Avatar name={person.fullName} photoUrl={person.avatarUrl} size={size} />

      <div className="friends-person-text">
        <strong className="friends-person-name">{person.fullName}</strong>
        {/* Empty only for a profile edited by hand; there is nothing to print then. */}
        {person.username && <span className="friends-person-handle">@{person.username}</span>}
      </div>
    </div>
  );
}
