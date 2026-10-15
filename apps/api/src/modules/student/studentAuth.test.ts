import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { accountFromToken, isReadableToken } from "./studentAuth";

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

describe("accountFromToken", () => {
  // A project that signs with an elliptic-curve key publishes it, and getClaims
  // checks tokens against it here without asking the auth server. Anyone can
  // read its key id, so anyone can put it in a token's header.
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "project-key", alg: "ES256", use: "sig" };
  const claims = part({ sub: "00000000-0000-4000-8000-00000000000b", role: "authenticated", aud: "authenticated", exp: 4102444800 });

  let server: http.Server;
  let auth: SupabaseClient["auth"];

  before(async () => {
    server = http.createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/auth/v1/.well-known/jwks.json") {
        response.writeHead(200);
        response.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      // As the auth server answers a token it did not issue.
      response.writeHead(401);
      response.end(JSON.stringify({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    auth = createClient(`http://127.0.0.1:${port}`, "stand-in-key", {
      auth: { persistSession: false, autoRefreshToken: false }
    }).auth;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("a made-up token naming the project's key with another algorithm means signed out", async (t) => {
    // getClaims threw over each of these, and every signed-in route answered
    // 500 with a stack trace: the bug hunt's BUG-035, through another door.
    const warn = t.mock.method(console, "warn", () => {});
    for (const alg of ["EdDSA", "PS256", "RS256"]) {
      const token = `${part({ alg, typ: "JWT", kid: "project-key" })}.${claims}.${signature}`;
      assert.equal(await accountFromToken(auth, token), null, alg);
    }
    // Noted in the log, naming the algorithm, in case a real one ever reads so.
    assert.equal(warn.mock.callCount(), 3);
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /"EdDSA"/);
  });

  test("so does a forged signature, and a token that cannot be read at all", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const forged = `${part({ alg: "ES256", typ: "JWT", kid: "project-key" })}.${claims}.${signature}`;
    assert.equal(await accountFromToken(auth, forged), null);
    assert.equal(await accountFromToken(auth, "abc.def.ghi"), null);
    // Neither is a puzzle worth a line in the log.
    assert.equal(warn.mock.callCount(), 0);
  });
});
