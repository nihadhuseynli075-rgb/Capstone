import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { recordOwner, storedRecordFate, type TabIdentity } from "@grade9/shared";

// The rules the web app applies to the result and the paper in progress that its
// tab keeps (apps/web/src/lib/examSession.ts). They live in the shared package,
// which has no test runner of its own, so they are tested here with the rest.

const ayla = "11111111-aaaa-4aaa-8aaa-111111111111";
const bakir = "22222222-bbbb-4bbb-8bbb-222222222222";
const guest = "guest-key-0000-0000-0000-000000000000";
const otherGuest = "guest-key-9999-9999-9999-999999999999";

const signedIn = (userId: string, guestKey: string | null = null): TabIdentity => ({ userId, guestKey });
const signedOut = (guestKey: string | null): TabIdentity => ({ userId: null, guestKey });

describe("storedRecordFate, signed in", () => {
  test("keeps what was saved for this account", () => {
    assert.equal(storedRecordFate(ayla, signedIn(ayla)), "keep");
    assert.equal(storedRecordFate(ayla, signedIn(ayla, guest)), "keep");
  });

  test("drops what was saved for another account, so the next student does not see it", () => {
    assert.equal(storedRecordFate(ayla, signedIn(bakir)), "drop");
    assert.equal(storedRecordFate(ayla, signedIn(bakir, guest)), "drop");
  });

  test("hands a guest's own record to the account that has just signed in", () => {
    assert.equal(storedRecordFate(guest, signedIn(ayla, guest)), "hand-over");
  });

  test("does not hand over a record from some other guest", () => {
    assert.equal(storedRecordFate(otherGuest, signedIn(ayla, guest)), "drop");
  });

  test("does not hand over when this browser has no unclaimed guest key", () => {
    // The key was claimed by an account: nothing stamped with it is a guest's.
    assert.equal(storedRecordFate(guest, signedIn(ayla, null)), "drop");
  });
});

describe("storedRecordFate, signed out", () => {
  test("drops the previous student's record, so a guest pressing Back sees nothing", () => {
    assert.equal(storedRecordFate(ayla, signedOut(guest)), "drop");
    assert.equal(storedRecordFate(ayla, signedOut(null)), "drop");
  });

  test("keeps the guest's own record", () => {
    assert.equal(storedRecordFate(guest, signedOut(guest)), "keep");
  });

  test("drops a record stamped with a guest key that is not this browser's current one", () => {
    assert.equal(storedRecordFate(otherGuest, signedOut(guest)), "drop");
    assert.equal(storedRecordFate(guest, signedOut(null)), "drop");
  });
});

describe("storedRecordFate, records with no usable stamp", () => {
  test("drops one saved before records were stamped", () => {
    assert.equal(storedRecordFate(undefined, signedIn(ayla)), "drop");
    assert.equal(storedRecordFate(undefined, signedOut(guest)), "drop");
  });

  test("drops an empty, null or non-text stamp, even when the tab has no identity either", () => {
    assert.equal(storedRecordFate("", signedOut(null)), "drop");
    assert.equal(storedRecordFate(null, signedOut(null)), "drop");
    assert.equal(storedRecordFate(7, signedIn(ayla)), "drop");
    assert.equal(storedRecordFate({}, signedOut(guest)), "drop");
  });
});

describe("a guest who signs in for the first time", () => {
  // The sequence the web app runs: stamp as the guest, sign in, settle.
  test("keeps the test they just finished, as the account's own", () => {
    const stamp = recordOwner(signedOut(guest));
    assert.equal(stamp, guest);

    assert.equal(storedRecordFate(stamp, signedIn(ayla, guest)), "hand-over");

    // After the hand-over the record carries the account's id, and stays theirs
    // on every later look, including once the guest key has been claimed.
    const restamped = ayla;
    assert.equal(storedRecordFate(restamped, signedIn(ayla, guest)), "keep");
    assert.equal(storedRecordFate(restamped, signedIn(ayla, null)), "keep");
  });

  test("and it is gone for the next student, once they sign out", () => {
    assert.equal(storedRecordFate(ayla, signedOut(null)), "drop");
    assert.equal(storedRecordFate(ayla, signedIn(bakir, null)), "drop");
  });
});

describe("recordOwner", () => {
  test("is the account when signed in, otherwise the guest key", () => {
    assert.equal(recordOwner(signedIn(ayla, guest)), ayla);
    assert.equal(recordOwner(signedOut(guest)), guest);
  });

  test("is nothing when the tab has no identity, which then reads back as dropped", () => {
    const owner = recordOwner(signedOut(null));
    assert.equal(owner, null);
    assert.equal(storedRecordFate(owner, signedOut(null)), "drop");
  });
});
