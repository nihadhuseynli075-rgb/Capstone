import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isReservedUsername,
  normalizeUsername,
  reservedUsernames,
  usernameLimits,
  usernamePattern,
  usernameProblem
} from "@grade9/shared";
import { checkUsername, isUsernameConflict, refusalFor, takenRefusal } from "./usernames";

describe("normalizeUsername", () => {
  test("lowercases, so Nihad and nihad are one name", () => {
    assert.equal(normalizeUsername("Nihad"), "nihad");
    assert.equal(normalizeUsername("NIHAD_99"), "nihad_99");
    assert.equal(normalizeUsername("Nihad"), normalizeUsername("nihad"));
  });

  test("drops surrounding space and one leading @, since the page writes @name", () => {
    assert.equal(normalizeUsername("  @Nihad \n"), "nihad");
    assert.equal(normalizeUsername("@@nihad"), "@nihad");
  });

  test("keeps what is inside the name for the checks to refuse, rather than repairing it", () => {
    assert.equal(normalizeUsername("ni had"), "ni had");
    assert.equal(normalizeUsername("ni-had"), "ni-had");
    assert.equal(normalizeUsername("a@b"), "a@b");
  });

  test("folds the Azerbaijani and Turkish letters onto plain ones", () => {
    assert.equal(normalizeUsername("İlkin"), "ilkin");
    assert.equal(normalizeUsername("Əli"), "eli");
    assert.equal(normalizeUsername("ıraq"), "iraq");
    assert.equal(normalizeUsername("Hüseyn_Çələbi"), "huseyn_celebi");
    assert.equal(normalizeUsername("Şəfa.Öz"), "sefa.oz");
    assert.equal(normalizeUsername("Ağa"), "aga");
  });

  test("an accent typed as a letter and a loose mark comes out the same", () => {
    assert.equal(normalizeUsername("über"), normalizeUsername("über"));
    assert.equal(normalizeUsername("İlkin"), "ilkin");
  });

  test("full-width letters are the letters", () => {
    assert.equal(normalizeUsername("ＮＩＨＡＤ"), "nihad");
  });

  test("leaves letters it cannot fold for the checks to refuse", () => {
    assert.equal(normalizeUsername("Нихад").length, 5);
    assert.equal(usernameProblem("Нихад"), "bad-characters");
  });
});

describe("usernameProblem", () => {
  test("accepts the shapes the rules allow", () => {
    for (const name of ["nihad", "nih", "a1b", "a_b", "a.b", "nihad_huseynli", "abcdefghijklmnopqrst", "x9.y_z"]) {
      assert.equal(usernameProblem(name), null, name);
    }
  });

  test("accepts what the page will normalise to a valid name", () => {
    assert.equal(usernameProblem("@Nihad"), null);
    assert.equal(usernameProblem("  Hüseyn  "), null);
  });

  test("the length limits are 3 and 20, both inclusive", () => {
    assert.equal(usernameLimits.min, 3);
    assert.equal(usernameLimits.max, 20);
    assert.equal(usernameProblem("ab"), "too-short");
    assert.equal(usernameProblem("abc"), null);
    assert.equal(usernameProblem("a".repeat(20)), null);
    assert.equal(usernameProblem("a".repeat(21)), "too-long");
  });

  test("nothing, or only the @, is empty", () => {
    assert.equal(usernameProblem(""), "empty");
    assert.equal(usernameProblem("   "), "empty");
    assert.equal(usernameProblem("@"), "empty");
  });

  test("it must start with a letter", () => {
    for (const name of ["1abc", "_abc", ".abc", "9lives"]) {
      assert.equal(usernameProblem(name), "bad-start", name);
    }
  });

  test("only a-z, 0-9, _ and . may follow", () => {
    for (const name of ["ni had", "ni-had", "ni@had", "nihad!", "nihad/", "ni\thad", "ni😀had", "nihad​"]) {
      assert.equal(usernameProblem(name), "bad-characters", JSON.stringify(name));
    }
  });

  test("the first problem is reported, in the order a person would fix them", () => {
    assert.equal(usernameProblem("1"), "too-short");
    assert.equal(usernameProblem("1 2 3"), "bad-characters");
    assert.equal(usernameProblem("1_2_3"), "bad-start");
    assert.equal(usernameProblem("a b c d e f g h i j k l m n"), "too-long");
  });

  test("names for the site and its staff are reserved", () => {
    for (const name of ["admin", "Admin", "@ExamPeak", "support", "ROOT", "staff"]) {
      assert.equal(usernameProblem(name), "reserved", name);
    }
  });

  test("a reserved name is not got round with dots or underscores", () => {
    for (const name of ["ad.min", "exam_peak", "exam.peak", "s_u_p_p_o_r_t", "_admin_".slice(1, 6), "admin.."]) {
      assert.equal(usernameProblem(name), "reserved", name);
    }
  });

  test("but a name that merely contains one is fine", () => {
    for (const name of ["admins", "administrator1", "exampeak2", "mysupport", "teamwork"]) {
      assert.equal(usernameProblem(name), null, name);
    }
  });

  test("every reserved name is written the way names are stored", () => {
    for (const name of reservedUsernames) {
      assert.equal(name, name.toLowerCase(), name);
      assert.ok(isReservedUsername(name), name);
    }
  });

  test("agrees with the pattern the database checks", () => {
    // Everything usernameProblem lets through must satisfy the same regular
    // expression the migration puts in the database, or the save would fail
    // there with an error nobody wrote a sentence for.
    const alphabet = "abcXYZ019_.-@ ç😀";
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };

    for (let round = 0; round < 3000; round += 1) {
      const length = next() % 24;
      let candidate = "";
      for (let index = 0; index < length; index += 1) {
        candidate += [...alphabet][next() % [...alphabet].length];
      }

      if (usernameProblem(candidate) === null) {
        assert.match(normalizeUsername(candidate), usernamePattern, JSON.stringify(candidate));
        assert.equal(isReservedUsername(normalizeUsername(candidate)), false, JSON.stringify(candidate));
      }
    }
  });
});

describe("checkUsername", () => {
  test("hands back the stored form of a good name", () => {
    assert.deepEqual(checkUsername("  @Nihad_99 "), { ok: true, username: "nihad_99" });
  });

  test("refuses a bad shape as 400 username-invalid, naming the rule", () => {
    const result = checkUsername("ni had");
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.equal(result.refusal.status, 400);
    assert.equal(result.refusal.code, "username-invalid");
    assert.equal(result.refusal.problem, "bad-characters");
    assert.match(result.refusal.message, /letters a-z/);
  });

  test("refuses a reserved name as its own code", () => {
    const result = checkUsername("Admin");
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.equal(result.refusal.status, 400);
    assert.equal(result.refusal.code, "username-reserved");
    assert.equal(result.refusal.problem, "reserved");
  });

  test("every problem has a sentence of its own", () => {
    const sentences = new Set(
      (["empty", "too-short", "too-long", "bad-start", "bad-characters", "reserved"] as const).map(
        (problem) => refusalFor(problem).message
      )
    );
    assert.equal(sentences.size, 6);
  });

  test("taken is a 409 that says so plainly", () => {
    assert.equal(takenRefusal.status, 409);
    assert.equal(takenRefusal.code, "username-taken");
    assert.equal(takenRefusal.message, "That username is taken.");
  });
});

describe("isUsernameConflict", () => {
  test("recognises the unique index on usernames, by its name", () => {
    assert.equal(
      isUsernameConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "profiles_username_key"'
      }),
      true
    );
  });

  test("or by the column in the detail", () => {
    assert.equal(
      isUsernameConflict({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (username)=(nihad) already exists."
      }),
      true
    );
  });

  test("not another uniqueness, such as the profile's own id", () => {
    assert.equal(
      isUsernameConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "profiles_pkey"',
        details: "Key (id)=(1b4e28ba) already exists."
      }),
      false
    );
  });

  test("not a different kind of failure that happens to mention the column", () => {
    assert.equal(
      isUsernameConflict({ code: "23514", message: 'new row violates check constraint "profiles_username_format"' }),
      false
    );
    assert.equal(isUsernameConflict({ message: "username" }), false);
  });
});
