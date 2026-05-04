import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrowserUrl, toEmbeddableUrl } from "./browserTools.js";

test("normalizeBrowserUrl adds https to bare domains", () => {
  assert.equal(normalizeBrowserUrl("youtube.com/watch?v=dQw4w9WgXcQ"), "https://youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(normalizeBrowserUrl("https://example.com/a"), "https://example.com/a");
});

test("toEmbeddableUrl converts YouTube watch and short URLs", () => {
  assert.equal(
    toEmbeddableUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1",
  );
  assert.equal(
    toEmbeddableUrl("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1",
  );
});

test("toEmbeddableUrl leaves ordinary URLs intact", () => {
  assert.equal(toEmbeddableUrl("https://example.com/docs"), "https://example.com/docs");
});
