import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { ageRequired, hasRecordedAge } from "./accountAge";
import { signedInAccount, type SignedInAccount } from "./studentAuth";

export const signInAgain = { message: "Sign in again to continue." } as const;

/**
 * Middleware for routes that belong to a signed-in account and to nobody else.
 *
 * Profiles and friends both work this way: the account is worked out from the
 * access token alone and no id is taken from the request, so there is no way to
 * name somebody else's. What differs is what to say when there are no accounts
 * to have, so each router passes in its own answer for that.
 *
 * An account that has not given its year of birth is refused with
 * ageRequired (see accountAge), except on the routes a router lists in
 * `withoutAge`, as [method, path] within the router: giving the year, and
 * deleting the account.
 */
export function requireAccount(
  unavailable: { code: string; message: string },
  options: { withoutAge?: Array<[string, string]> } = {}
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    // Without Supabase there are no accounts. The page shows this rather than
    // failing on every button.
    if (!supabaseAdmin) {
      response.status(503).json(unavailable);
      return;
    }

    try {
      const account = await signedInAccount(request);

      if (!account) {
        response.status(401).json(signInAgain);
        return;
      }

      const exempt = (options.withoutAge ?? []).some(
        ([method, path]) => request.method === method && request.path === path
      );

      if (!exempt && !(await hasRecordedAge(account))) {
        response.status(403).json(ageRequired);
        return;
      }

      response.locals.account = account;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The account `requireAccount` let through. Only call this behind it. */
export function accountOf(response: Response): SignedInAccount {
  return response.locals.account as SignedInAccount;
}
