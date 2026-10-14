import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { httpsPicturesOnly, originOf, pictureLinkProblem, quotedLink, type PictureLinkRules } from "./pictureLinks";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("pictureLinkProblem", () => {
  test("a full https link is a picture link, wherever it points", () => {
    for (const link of ["https://example.com/q.png", "https://abc.supabase.co/storage/v1/object/public/question-images/a.png", "https://example.com/picture%203.jpg?v=2"]) {
      assert.equal(pictureLinkProblem(link, httpsPicturesOnly), null, link);
    }
  });

  test("a file name, a page script, plain http and other schemes are not", () => {
    for (const link of [
      "diagram1.png",
      "picture 3.jpg",
      "/storage/v1/object/public/question-images/a.png",
      "javascript:alert(1)",
      "http://example.com/q.png",
      "http://127.0.0.1:54775/internal-only",
      "ftp://example.com/q.png",
      "file:///C:/pictures/q.png",
      "https://",
      "data:text/html,<script>alert(1)</script>",
      "data:image/svg+xml;base64,PHN2Zy8+",
      "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    ]) {
      assert.equal(pictureLinkProblem(link, httpsPicturesOnly), "not-https", link);
    }
  });

  test("any link into the project's own storage is taken, whatever its scheme", () => {
    const local: PictureLinkRules = { supabaseOrigin: "http://127.0.0.1:54321", allowInlinePictures: false };
    assert.equal(pictureLinkProblem("http://127.0.0.1:54321/storage/v1/object/public/question-images/a.png", local), null);
    // Another port on the same machine is somewhere else entirely.
    assert.equal(pictureLinkProblem("http://127.0.0.1:54322/storage/v1/object/public/question-images/a.png", local), "not-https");
    assert.equal(pictureLinkProblem("http://localhost:54321/a.png", local), "not-https");
  });

  test("a picture kept in the question is taken only while no storage is connected", () => {
    assert.equal(pictureLinkProblem(PNG, { supabaseOrigin: null, allowInlinePictures: true }), null);
    assert.equal(pictureLinkProblem("data:image/jpeg;base64,/9j/4AAQ", { supabaseOrigin: null, allowInlinePictures: true }), null);
    assert.equal(pictureLinkProblem(PNG, httpsPicturesOnly), "inline-with-storage");
    // Only the three picture types the upload takes, written as the upload writes them.
    assert.equal(pictureLinkProblem("data:image/svg+xml;base64,PHN2Zy8+", { supabaseOrigin: null, allowInlinePictures: true }), "not-https");
    assert.equal(pictureLinkProblem("data:image/png;base64,not base64!", { supabaseOrigin: null, allowInlinePictures: true }), "not-https");
  });
});

describe("originOf", () => {
  test("is the origin of an http or https URL, and null for anything else", () => {
    assert.equal(originOf("https://abc.supabase.co"), "https://abc.supabase.co");
    assert.equal(originOf("http://127.0.0.1:54740/"), "http://127.0.0.1:54740");
    assert.equal(originOf(undefined), null);
    assert.equal(originOf(""), null);
    assert.equal(originOf("not a url"), null);
    // Its origin is "null", the same as every data: link's.
    assert.equal(originOf("data:image/png;base64,AAAA"), null);
  });
});

describe("quotedLink", () => {
  test("keeps a short link and cuts a long one", () => {
    assert.equal(quotedLink("diagram1.png"), "diagram1.png");
    assert.equal(quotedLink(PNG).length, 60);
    assert.ok(quotedLink(PNG).endsWith("..."));
  });
});
