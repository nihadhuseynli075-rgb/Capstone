import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkPictureLink, httpsPicturesOnly, originOf, quotedLink, type PictureLinkRules } from "./pictureLinks";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const local: PictureLinkRules = { supabaseOrigin: "http://127.0.0.1:54321", allowInlinePictures: false };
const memory: PictureLinkRules = { supabaseOrigin: null, allowInlinePictures: true };

describe("checkPictureLink", () => {
  test("a full https link is a picture link, wherever it points, and is kept as it is", () => {
    for (const link of [
      "https://example.com/q.png",
      "https://abc.supabase.co/storage/v1/object/public/question-images/a.png",
      "https://example.com/picture%203.jpg?v=2"
    ]) {
      assert.deepEqual(checkPictureLink(link, httpsPicturesOnly), { link }, link);
    }
  });

  test("a file name, a page script, plain http and other schemes are not", () => {
    for (const link of [
      "diagram1.png",
      "picture 3.jpg",
      "/storage/v1/object/public/question-images/a.png",
      "javascript:alert(1)",
      "http://example.com/q.png",
      "http:example.com/q.png",
      "http://127.0.0.1:54775/internal-only",
      "ftp://example.com/q.png",
      "file:///C:/pictures/q.png",
      "https://",
      "data:text/html,<script>alert(1)</script>",
      "data:image/svg+xml;base64,PHN2Zy8+",
      "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    ]) {
      assert.deepEqual(checkPictureLink(link, httpsPicturesOnly), { problem: "not-https" }, link);
    }
  });

  test("a link the parser reads as https is saved as it reads it, not as typed", () => {
    // Typed like this, a page served over https read the first three as paths
    // on its own site, while the marker fetched https://example.com/diagram.png.
    const spellings: Array<[string, string]> = [
      ["https:example.com/diagram.png", "https://example.com/diagram.png"],
      ["https:/example.com/diagram.png", "https://example.com/diagram.png"],
      ["https:\\\\example.com\\diagram.png", "https://example.com/diagram.png"],
      ["https://example.com\\pictures\\diagram.png", "https://example.com/pictures/diagram.png"],
      ["HTTPS://EXAMPLE.COM/Diagram.PNG", "https://example.com/Diagram.PNG"],
      ["  https://example.com/diagram.png\t", "https://example.com/diagram.png"],
      ["https://exam\nple.com/dia\tgram.png", "https://example.com/diagram.png"],
      ["https://example.com/picture 3.jpg", "https://example.com/picture%203.jpg"],
      ["https://Bücher.example/b.png", "https://xn--bcher-kva.example/b.png"],
      ["https://example.com:443/diagram.png", "https://example.com/diagram.png"]
    ];
    for (const [typed, saved] of spellings) {
      assert.deepEqual(checkPictureLink(typed, httpsPicturesOnly), { link: saved }, typed);
    }
  });

  test("any link into the project's own storage is taken, whatever its scheme, and saved in full", () => {
    const stored = "http://127.0.0.1:54321/storage/v1/object/public/question-images/a.png";
    assert.deepEqual(checkPictureLink(stored, local), { link: stored });
    for (const typed of [
      "http:127.0.0.1:54321/storage/v1/object/public/question-images/a.png",
      "HTTP://127.0.0.1:54321/storage/v1/object/public/question-images/a.png",
      "http:\\\\127.0.0.1:54321\\storage\\v1\\object\\public\\question-images\\a.png"
    ]) {
      assert.deepEqual(checkPictureLink(typed, local), { link: stored }, typed);
    }
    // Another port on the same machine is somewhere else entirely.
    assert.deepEqual(checkPictureLink("http://127.0.0.1:54322/storage/v1/object/public/question-images/a.png", local), {
      problem: "not-https"
    });
    assert.deepEqual(checkPictureLink("http://localhost:54321/a.png", local), { problem: "not-https" });
  });

  test("a picture kept in the question is taken only while no storage is connected", () => {
    assert.deepEqual(checkPictureLink(PNG, memory), { link: PNG });
    assert.deepEqual(checkPictureLink("data:image/jpeg;base64,/9j/4AAQ", memory), { link: "data:image/jpeg;base64,/9j/4AAQ" });
    assert.deepEqual(checkPictureLink(PNG, httpsPicturesOnly), { problem: "inline-with-storage" });
    // Only the three picture types the upload takes, written as the upload writes them.
    assert.deepEqual(checkPictureLink("data:image/svg+xml;base64,PHN2Zy8+", memory), { problem: "not-https" });
    assert.deepEqual(checkPictureLink("data:image/png;base64,not base64!", memory), { problem: "not-https" });
    assert.deepEqual(checkPictureLink("DATA:image/png;base64,iVBORw0KGgo=", memory), { problem: "not-https" });
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
