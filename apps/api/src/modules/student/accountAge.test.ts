import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MIN_ACCOUNT_AGE, birthYearProblem, latestAccountBirthYear, parseBirthYear } from "@grade9/shared";
import { ageFromAppMetadata, signUpBirthYear } from "./accountAge";
import type { SignedInAccount } from "./studentAuth";

const NOV_2026 = new Date("2026-11-16T12:00:00Z");

function account(overrides: Partial<SignedInAccount>): SignedInAccount {
  return {
    id: "6b360477-f674-456d-b1a9-b0a83aaf0914",
    email: "student@example.test",
    provider: "email",
    providers: ["email"],
    metadata: {},
    age: null,
    ...overrides
  };
}

describe("the age rule", () => {
  test("is one constant, 16", () => {
    assert.equal(MIN_ACCOUNT_AGE, 16);
  });

  test("lets in only a year everyone born in has turned 16 by: 2009 in 2026, 2010 from 2027", () => {
    assert.equal(latestAccountBirthYear(NOV_2026), 2009);
    assert.equal(latestAccountBirthYear(new Date("2027-01-01T00:00:00Z")), 2010);
  });

  test("says which side of it a year is on", () => {
    assert.equal(birthYearProblem(2009, NOV_2026), null);
    assert.equal(birthYearProblem(1990, NOV_2026), null);
    assert.equal(birthYearProblem(2010, NOV_2026), "too-young");
    assert.equal(birthYearProblem(2014, NOV_2026), "too-young");
  });

  test("refuses anything that is not a year someone could be born in", () => {
    assert.equal(birthYearProblem(2027, NOV_2026), "invalid");
    assert.equal(birthYearProblem(1905, NOV_2026), "invalid");
    assert.equal(birthYearProblem(2008.5, NOV_2026), "invalid");
    assert.equal(birthYearProblem("2008", NOV_2026), "invalid");
    assert.equal(birthYearProblem(null, NOV_2026), "invalid");
  });

  test("reads a typed year as four digits and nothing else", () => {
    assert.equal(parseBirthYear("2008"), 2008);
    assert.equal(parseBirthYear(" 2008 "), 2008);
    assert.equal(parseBirthYear("08"), null);
    assert.equal(parseBirthYear("2008a"), null);
    assert.equal(parseBirthYear(""), null);
  });
});

describe("ageFromAppMetadata", () => {
  test("reads the year and the time the API wrote", () => {
    assert.deepEqual(ageFromAppMetadata({ provider: "email", birth_year: 2005, age_confirmed_at: "2026-11-16T06:02:16.984Z" }), {
      birthYear: 2005,
      confirmedAt: "2026-11-16T06:02:16.984Z"
    });
  });

  test("is null without both, or with either in a shape the API never writes", () => {
    assert.equal(ageFromAppMetadata({ provider: "email" }), null);
    assert.equal(ageFromAppMetadata({ birth_year: 2005 }), null);
    assert.equal(ageFromAppMetadata({ birth_year: "2005", age_confirmed_at: "2026-11-16T06:02:16.984Z" }), null);
    assert.equal(ageFromAppMetadata({ birth_year: 2005, age_confirmed_at: "yesterday" }), null);
    assert.equal(ageFromAppMetadata(null), null);
    assert.equal(ageFromAppMetadata("2005"), null);
  });
});

describe("signUpBirthYear", () => {
  test("takes the year the sign-up form sent, as a number or four digits", () => {
    assert.equal(signUpBirthYear(account({ metadata: { birth_year: 2005 } })), 2005);
    assert.equal(signUpBirthYear(account({ metadata: { birth_year: "2005" } })), 2005);
  });

  test("is null when there is none, or it is not a year", () => {
    assert.equal(signUpBirthYear(account({})), null);
    assert.equal(signUpBirthYear(account({ metadata: { birth_year: "two thousand" } })), null);
    assert.equal(signUpBirthYear(account({ metadata: { birth_year: 2005.5 } })), null);
  });

  test("is not taken once Google has signed in to the account: it may be a stranger's", () => {
    assert.equal(signUpBirthYear(account({ providers: ["email", "google"], metadata: { birth_year: 2005 } })), null);
    assert.equal(signUpBirthYear(account({ provider: "google", providers: ["google"], metadata: { birth_year: 2005 } })), null);
  });
});
