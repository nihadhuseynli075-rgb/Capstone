import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { isUuid } from "../lib/ids";
import { accountOf, requireAccount, signInAgain } from "../modules/student/requireAccount";
import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  getOverview,
  removeFriend,
  sendRequest,
  type SendOutcome
} from "../repositories/friendRepository";
import { ensureProfile } from "../repositories/profileRepository";
import { parseLookup } from "../services/friends";

/**
 * The signed-in student's friends: who they are, who has asked, and who they
 * have asked.
 *
 * Like the profile routes, every one of these acts for the account the access
 * token belongs to. The only ids that arrive in a request are friendship ids,
 * and each is matched against the rows that involve this account, so a request
 * that names somebody else's row finds nothing and is answered as if it never
 * existed.
 */
export const friendsRouter = Router();

friendsRouter.use(
  requireAccount({
    code: "friends-unavailable",
    message:
      "Friends need real accounts, and the API is not connected to Supabase. Set SUPABASE_SERVICE_ROLE_KEY in .env and restart the API."
  })
);

friendsRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await getOverview(accountOf(response).id));
  } catch (error) {
    next(error);
  }
});

const sendSchema = z.object({
  emailOrUsername: z
    .string()
    .trim()
    .min(1, "Enter an email address or a username.")
    .max(254, "That is too long to be an email address or a username.")
});

/** How each refusal to send a request is told to the page: a status, a code to branch on, and the words. */
const refusals: Record<Extract<SendOutcome, { refused: string }>["refused"], { status: number; message: string }> = {
  yourself: { status: 400, message: "That is your own account. Add a friend instead." },
  // A plain answer rather than a vague one. Anyone signed in can ask, and for
  // an app this size being told whether an account exists beats a student
  // wondering whether the request went anywhere.
  "no-account": { status: 404, message: "No Exampeak account with that email or username." },
  "already-friends": { status: 409, message: "You are already friends." },
  "already-requested": { status: 409, message: "You have already sent them a request. They have not answered yet." },
  blocked: { status: 403, message: "A request cannot be sent to that account." }
};

friendsRouter.post("/requests", async (request, response, next) => {
  const parsed = sendSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      code: "invalid-lookup",
      message: parsed.error.issues[0]?.message ?? "Enter an email address or a username."
    });
  }

  const lookup = parseLookup(parsed.data.emailOrUsername);

  if (!lookup) {
    return response
      .status(400)
      .json({ code: "invalid-lookup", message: "Enter an email address or a username, without spaces." });
  }

  try {
    const account = accountOf(response);
    // The friendship points at this account's profile, which an account from
    // before the sign-up trigger existed may not have had made yet.
    if (!(await ensureProfile(account))) return response.status(401).json(signInAgain);

    const outcome = await sendRequest(account.id, account.email, lookup);

    if ("refused" in outcome) {
      const { status, message } = refusals[outcome.refused];
      return response.status(status).json({ code: outcome.refused, message });
    }

    // 201 for a request made, 200 for the other student's accepted.
    response.status(outcome.sent.outcome === "requested" ? 201 : 200).json(outcome.sent);
  } catch (error) {
    next(error);
  }
});

const gone = { code: "gone", message: "That request is no longer there." } as const;

/**
 * A route that answers or ends one friendship row by its id.
 *
 * A malformed id is a row that does not exist, not a database error, and a row
 * that is not this account's, or not in the state the action needs, is the
 * same. The page treats that as already done and reloads.
 */
function byRowId(act: (me: string, id: string) => Promise<boolean>): RequestHandler<{ id: string }> {
  return async (request, response, next) => {
    try {
      const { id } = request.params;
      if (!isUuid(id) || !(await act(accountOf(response).id, id))) return response.status(404).json(gone);

      response.json({ done: true });
    } catch (error) {
      next(error);
    }
  };
}

friendsRouter.post("/requests/:id/accept", async (request, response, next) => {
  try {
    const { id } = request.params;
    const person = isUuid(id) ? await acceptRequest(accountOf(response).id, id) : null;
    if (!person) return response.status(404).json(gone);

    response.json({ outcome: "accepted", person });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post("/requests/:id/decline", byRowId(declineRequest));

// The sender taking back their own request. The recipient turning one down is
// the POST above, so each verb is only ever the one side's.
friendsRouter.delete("/requests/:id", byRowId(cancelRequest));

friendsRouter.delete("/:id", byRowId(removeFriend));
