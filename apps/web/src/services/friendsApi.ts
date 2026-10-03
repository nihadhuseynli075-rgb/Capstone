import type { FriendPerson, FriendsOverview, SentFriendRequest } from "@grade9/shared";
import { accountToken } from "./accountToken";
import { apiRequest } from "./apiClient";

/**
 * The signed-in student's friends.
 *
 * Like the profile, nothing here has a guest version: friends are accounts, so
 * every call carries the account's access token and the API works out whose
 * friends they are from that alone.
 */

export async function fetchFriends(): Promise<FriendsOverview> {
  return apiRequest<FriendsOverview>("/api/friends", { token: await accountToken() });
}

/** `emailOrUsername` is whatever was typed; the API works out which it is. */
export async function sendFriendRequest(emailOrUsername: string): Promise<SentFriendRequest> {
  return apiRequest<SentFriendRequest>("/api/friends/requests", {
    method: "POST",
    body: { emailOrUsername },
    token: await accountToken()
  });
}

export async function acceptFriendRequest(requestId: string): Promise<FriendPerson> {
  const { person } = await apiRequest<{ person: FriendPerson }>(`/api/friends/requests/${requestId}/accept`, {
    method: "POST",
    token: await accountToken()
  });
  return person;
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  await apiRequest<{ done: true }>(`/api/friends/requests/${requestId}/decline`, {
    method: "POST",
    token: await accountToken()
  });
}

/** Takes back a request this student sent. */
export async function cancelFriendRequest(requestId: string): Promise<void> {
  await apiRequest<{ done: true }>(`/api/friends/requests/${requestId}`, {
    method: "DELETE",
    token: await accountToken()
  });
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await apiRequest<{ done: true }>(`/api/friends/${friendshipId}`, {
    method: "DELETE",
    token: await accountToken()
  });
}
