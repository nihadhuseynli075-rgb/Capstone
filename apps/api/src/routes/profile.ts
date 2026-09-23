import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { profileLimits } from "@grade9/shared";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { isLiveSession, signedInAccount, type SignedInAccount } from "../modules/student/studentAuth";
import { deleteAttemptsFor } from "../repositories/attemptRepository";
import {
  deleteAccount,
  ensureProfile,
  mirrorNameToAccount,
  setProfilePhoto,
  updateProfileName
} from "../repositories/profileRepository";
import {
  photoTypeOf,
  removePhotoAt,
  removePhotos,
  storePhoto,
  storedPhotoPath
} from "../services/profilePhotos";

/**
 * The signed-in student's own profile: read it, rename it, change or remove
 * the photo, and delete the whole account.
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

const renameSchema = z.object({
  fullName: z
    .string()
    // Runs of spaces, tabs or line breaks become one space, so a name pasted
    // in from elsewhere cannot bring its layout onto the leaderboard.
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(profileLimits.nameMin, "That name is too short.")
        .max(profileLimits.nameMax, "That name is too long.")
    )
});

profileRouter.patch("/", async (request, response, next) => {
  const parsed = renameSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: parsed.error.issues[0]?.message ?? "That name is not valid.",
      issues: parsed.error.flatten()
    });
  }

  try {
    const account = accountOf(response);
    if (!(await ensureProfile(account))) return response.status(401).json(signInAgain);

    const profile = await updateProfileName(account.id, parsed.data.fullName);
    if (!profile) return response.status(401).json(signInAgain);

    await mirrorNameToAccount(account.id, profile.fullName);

    response.json({ profile });
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
    return response.status(400).json({ message: "Choose a photo to upload." });
  }

  const bytes = Buffer.from(parsed.data.dataBase64, "base64");

  if (bytes.byteLength === 0) {
    return response.status(400).json({ message: "That photo was empty." });
  }

  if (bytes.byteLength > profileLimits.photoMaxBytes) {
    return response.status(413).json({ message: "Photos must be 2 MB or smaller." });
  }

  const type = photoTypeOf(bytes);

  if (!type) {
    return response.status(400).json({ message: "Only JPG, PNG or WebP photos can be used." });
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

  const account = accountOf(response);
  const typed = parsed.data.confirmEmail.trim().toLowerCase();

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

  try {
    // Deleting is the one thing that cannot be undone, so the token is checked
    // against the auth server rather than on its signature alone: a token from
    // a session that has been signed out still verifies until it expires, and
    // whoever found it could read the email to confirm with out of it.
    if (!(await isLiveSession(request))) return response.status(401).json(signInAgain);

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
