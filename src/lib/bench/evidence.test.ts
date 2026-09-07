import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceRoot, forensicFileEar } from "./evidence.ts";

test("evidence root is a durable folder, not tmp", () => {
  const root = evidenceRoot();
  assert.equal(root.includes("evidence"), true);
  assert.equal(root.includes("/tmp/"), false);
});

test("a live ear URL is rewritten to the file ear", async () => {
  const ear = await forensicFileEar("http://127.0.0.1:4850/live");
  assert.equal(ear, "http://127.0.0.1:4850/stt");
});
