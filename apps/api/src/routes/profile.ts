import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { normalizeUsername, profileLimits } from "@grade9/shared";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { liveAccount, signedInAccount, type SignedInAccount } from "../modules/student/studentAuth";
import { deleteAttemptsFor } from "../repositories/attemptRepository";
import {
  deleteAccount,
  ensureProfile,
  mirrorNameToAccount,
  setProfilePhoto,
  updateProfileDetails,
  UsernameTakenError,
  usernameOwnerId
} from "../repositories/profileRepository";
import {
  photoTypeOf,
  removePhotoAt,
  removePhotos,
  storePhoto,
  storedPhotoPath
} from "../services/profilePhotos";
import { checkUsername, takenRefusal } from "../services/usernames";

/**
 * The signed-in student's own profile: read it, rename it, change its
 * username, change or remove the photo, and delete the whole account.
 *
 * Every route acts on the account the access token belongs to and takes no id
 * from the request, so there is no way to name somebody else's profile here.
 */
export const profileRouter = Router();

const signInAgain = { message: "Sign in again to continue." } as const;

async function requireAccount(request: Request, response: Response, next: NextFunction): Promise<void> {
  // Without Supabase there are no accounts to have profiles. The page shows
  // this rather than failing on every button.
  if (!supabaseAdmin) {
    response.status(503).json({
      code: "profiles-unavailable",
      message:
        "Profiles need the API connected to Supabase. Set SUPABASE_SERVICE_ROLE_KEY in .env and restart the API."
    });
    return;
  }

  try {
    const account = await signedInAccount(request);

    if (!account) {
      response.status(401).json(signInAgain);
      return;
    }

    response.locals.account = account;
    next();
  } catch (error) {
    next(error);
  }
}

profileRouter.use(requireAccount);

function accountOf(response: Response): SignedInAccount {
  return response.locals.account as SignedInAccount;
}

profileRouter.get("/", async (_request, response, next) => {
  try {
    const profile = await ensureProfile(accountOf(response));
    if (!profile) return response.status(401).json(signInAgain);

    response.json({ profile });
  } catch (error) {
    next(error);
  }
});

const nameField = z
  .string({ invalid_type_error: "That name is not valid." })
  // Runs of spaces, tabs or line breaks become one space, so a name pasted
  // in from elsewhere cannot bring its layout onto the leaderboard.
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(profileLimits.nameMin, "That name is too short.")
      .max(profileLimits.nameMax, "That name is too long.")
  );

/**
 * Either or both may be sent. The username is checked below rather than here,
 * because its refusals say which rule it broke, and the browser words each of
 * those in the student's language.
 */
const updateSchema = z
  .object({
    fullName: nameField.optional(),
    username: z.string({ invalid_type_error: "That username is not valid." }).optional()
  })
  .refine((value) => value.fullName !== undefined || value.username !== undefined, {
    message: "Send a name or a username to change."
  });

profileRouter.patch("/", async (request, response, next) => {
  const parsed = updateSchema.safeParse(request.body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return response.status(400).json({
      code: issue?.path[0] === "fullName" ? "name-invalid" : "invalid-request",
      message: issue?.message ?? "That is not valid.",
      issues: parsed.error.flatten()
    });
  }

  let username: string | undefined;

  if (parsed.data.username !== undefined) {
    const checked = checkUsername(parsed.data.username);
    if (!checked.ok) return response.status(checked.refusal.status).json(checked.refusal);
    username = checked.username;
  }

  try {
    const account = accountOf(response);
    const existing = await ensureProfile(account);
    if (!existing) return response.status(401).json(signInAgain);

    // Asking for the username the student has already is not a change. It is
    // left out of the write, which would otherwise be refused by their own row.
    const changes = {
      fullName: parsed.data.fullName,
      username: username !== existing.username ? username : undefined
    };

    const profile =
      changes.fullName === undefined && changes.username === undefined
        ? existing
        : await updateProfileDetails(account.id, changes);
    if (!profile) return response.status(401).json(signInAgain);

    // Even when the name is the same as before: saving it again is how a name
    // that a Google sign-in overwrote on the account gets put back.
    if (changes.fullName !== undefined) await mirrorNameToAccount(account.id, profile.fullName);

    response.json({ profile });
  } catch (error) {
    if (error instanceof UsernameTakenError) return response.status(takenRefusal.status).json(takenRefusal);
    next(error);
  }
});

/**
 * Whether a username could be saved: the form's hint while its owner types.
 *
 * It answers 200 for any text and says in the body what is wrong with it, so a
 * name being typed does not fill the browser's console with failed requests.
 * Only a hint, and meant to be: someone else can take the name a moment after
 * this says it is free, and the save is what decides.
 */
profileRouter.get("/username-available", async (request, response, next) => {
  const typed = request.query.username;

  if (typeof typed !== "string") {
    return response.status(400).json({
      code: "invalid-request",
      message: "Send the username to check as ?username=name."
    });
  }

  const checked = checkUsername(typed);

  if (!checked.ok) {
    return response.json({
      username: normalizeUsername(typed),
      available: false,
      reason: checked.refusal.code === "username-reserved" ? "reserved" : "invalid",
      problem: checked.refusal.problem
    });
  }

  try {
    const owner = await usernameOwnerId(checked.username);
    const yours = owner === accountOf(response).id;

    response.json({
      username: checked.username,
      available: owner === null || yours,
      reason: owner === null ? null : yours ? "yours" : "taken"
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload or replace the photo.
 *
 * Sent as base64 in JSON, like question diagrams, so there is one way of
 * uploading in the whole API. The browser has already cropped and shrunk it;
 * the checks here are the ones that matter, because a request does not have
 * to come from the browser.
 */
profileRouter.put("/photo", async (request, response, next) => {
  const parsed = z.object({ dataBase64: z.string().min(1) }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ code: "photo-missing", message: "Choose a photo to upload." });
  }

  const bytes = Buffer.from(parsed.data.dataBase64, "base64");

  if (bytes.byteLength === 0) {
    return response.status(400).json({ code: "photo-empty", message: "That photo was empty." });
  }

  if (bytes.byteLength > profileLimits.photoMaxBytes) {
    return response.status(413).json({ code: "photo-too-large", message: "Photos must be 2 MB or smaller." });
  }

  const type = photoTypeOf(bytes);

  if (!type) {
    return response.status(400).json({ code: "photo-type", message: "Only JPG, PNG or WebP photos can be used." });
  }

  try {
    const account = accountOf(response);
    const existing = await ensureProfile(account);
    if (!existing) return response.status(401).json(signInAgain);

    // If saving the new address fails after this, the file is left in the
    // folder unused, and the account's deletion sweeps it.
    const stored = await storePhoto(account.id, bytes, type);

    const profile = await setProfilePhoto(account.id, stored.url);

    if (!profile) {
      // The account was deleted while this was uploading, so nothing will
      // ever sweep its folder again.
      await removePhotoAt(stored.path).catch(() => undefined);
      return response.status(401).json(signInAgain);
    }

    // Only the photo this one replaced, never a sweep of the folder: two tabs
    // uploading at once would otherwise each delete the other's file, and the
    // profile would be left pointing at one that no longer exists. Failing to
    // tidy up is not a reason to fail an upload that has worked.
    const replaced = storedPhotoPath(account.id, existing.avatarUrl);

    if (replaced && replaced !== stored.path) {
      await removePhotoAt(replaced).catch((error: Error) => {
        console.error(`[api] Could not delete the replaced photo for ${account.id}: ${error.message}`);
      });
    }

    response.json({ profile });
  } catch (error) {
    next(error);
  }
});

profileRouter.delete("/photo", async (_request, response, next) => {
  try {
    const account = accountOf(response);
    const existing = await ensureProfile(account);
    if (!existing) return response.status(401).json(signInAgain);

    // The file goes first, and only then does it come off the profile.
    //
    // The other way round reads better but cannot be retried: the moment the
    // profile forgets the address, a file left behind by a failed delete is
    // one nothing points at, sitting in a public bucket, with nothing left to
    // find it by. This way a failure leaves the photo exactly as it was, and
    // pressing Remove again picks up where it left off.
    const stored = storedPhotoPath(account.id, existing.avatarUrl);

    if (stored) {
      try {
        await removePhotoAt(stored);
      } catch (error) {
        throw new Error(
          `Your photo could not be deleted just now, so it is still on your profile. Try again in a moment. (${(error as Error).message})`
        );
      }
    }

    const profile = await setProfilePhoto(account.id, null);
    if (!profile) return response.status(401).json(signInAgain);

    response.json({ profile });
  } catch (error) {
    next(error);
  }
});

/**
 * Deletes the account and everything that belongs to it.
 *
 * The page asks for the account's email typed back before it sends this.
 * Checking it here as well means nothing but that deliberate step can delete
 * an account: not a stray request, and not a bug in the page.
 */
profileRouter.delete("/", async (request, response, next) => {
  const parsed = z.object({ confirmEmail: z.string() }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Type your email address to confirm." });
  }

  const typed = parsed.data.confirmEmail.trim().toLowerCase();

  try {
    // Deleting is the one thing that cannot be undone, so the token is checked
    // against the auth server rather than on its signature alone: a token from
    // a session that has been signed out still verifies until it expires, and
    // whoever found it could read the email to confirm with out of it.
    //
    // The email to confirm against is the server's too, not the token's. A
    // student who has just changed their address sees the new one on the page
    // while their token still says the old one, and would be told their own
    // address does not match.
    const account = await liveAccount(request);
    if (!account) return response.status(401).json(signInAgain);

    // An account with no email address cannot confirm this way, and deleting it
    // on an empty string is the one thing that must not happen. Every account
    // here is made with an email, so this is a guard, not a path anyone travels.
    if (account.email.length === 0) {
      return response.status(400).json({
        code: "confirmation-mismatch",
        message: "This account has no email address to confirm with, so it cannot be deleted here."
      });
    }

    if (typed !== account.email.toLowerCase()) {
      return response.status(400).json({
        code: "confirmation-mismatch",
        message: "That does not match your email address, so nothing was deleted."
      });
    }

    // Photos first, then test history, then the account itself. Each step is
    // safe to repeat, and the account goes last: if anything before it fails,
    // the student can still sign in and try again, rather than being left
    // with photos or tests that no account can reach any more.
    await removePhotos(account.id);
    await deleteAttemptsFor(account.id);
    await deleteAccount(account.id);

    // A photo uploaded by another tab while this was running would otherwise
    // outlive the account, in a public bucket, with nothing left to sweep it.
    await removePhotos(account.id).catch((error: Error) => {
      console.error(`[api] Could not sweep photos after deleting ${account.id}: ${error.message}`);
    });

    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});
