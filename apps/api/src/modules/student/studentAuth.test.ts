import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isReadableToken } from "./studentAuth";

/** One part of a token: what it says, in base64url. */
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const raw = (bytes: number[]) => Buffer.from(bytes).toString("base64url");

const header = part({ alg: "ES256", kid: "a1b2c3", typ: "JWT" });
const payload = part({ sub: "00000000-0000-4000-8000-00000000000a", email: "ana@school.example", role: "authenticated" });
const signature = raw([1, 2, 3, 4, 5, 6, 7, 8, 9]);

describe("isReadableToken", () => {
  test("a token shaped like the ones Supabase issues can be read", () => {
    assert.equal(isReadableToken(`${header}.${payload}.${signature}`), true);
  });

  test("so can one carrying a name in Azerbaijani or Russian", () => {
    // The account's name travels in the token, written out in UTF-8.
    const named = part({ sub: "x", user_metadata: { full_name: "Gülnar Əliyeva", note: "Привет" } });
    assert.equal(isReadableToken(`${header}.${named}.${signature}`), true);
  });

  test("being readable is not being genuine: a forged signature still reads", () => {
    // getClaims is what turns this one away, as an error it returns.
    assert.equal(isReadableToken(`${header}.${payload}.${raw([0])}`), true);
  });

  test("the header from the bug hunt cannot: its bytes are not UTF-8", () => {
    // getClaims threw "Invalid UTF-8 sequence" over it, and every signed-in
    // route answered 500.
    assert.equal(isReadableToken("abc.def.ghi"), false);
    assert.equal(isReadableToken(`${raw([0xff, 0xfe, 0xfd])}.${payload}.${signature}`), false);
  });

  test("anything that is not three parts cannot", () => {
    assert.equal(isReadableToken("not-a-token"), false);
    assert.equal(isReadableToken(`${header}.${payload}`), false);
    assert.equal(isReadableToken(`${header}.${payload}.${signature}.${signature}`), false);
    assert.equal(isReadableToken(`${header}.${payload}.`), false);
    assert.equal(isReadableToken(""), false);
  });

  test("nor can a part written in anything but base64url", () => {
    assert.equal(isReadableToken(`${header}+.${payload}.${signature}`), false);
    assert.equal(isReadableToken(`${header}.${payload}=.${signature}`), false);
    assert.equal(isReadableToken(`${header}.${payload}.${signature} `), false);
  });

  test("nor text that is not JSON, or JSON that is not an object", () => {
    assert.equal(isReadableToken(`${Buffer.from("hello").toString("base64url")}.${payload}.${signature}`), false);
    for (const value of [null, "a string", 42, ["alg", "ES256"]]) {
      assert.equal(isReadableToken(`${part(value)}.${payload}.${signature}`), false, JSON.stringify(value));
      assert.equal(isReadableToken(`${header}.${part(value)}.${signature}`), false, JSON.stringify(value));
    }
  });
});
