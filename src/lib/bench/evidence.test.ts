import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceRoot, forensicFileEar } from "./evidence.ts";

test("evidence root is ELEMENTS, not tmp", () => {
  const prior = process.env.BENCH_EVIDENCE;
  delete process.env.BENCH_EVIDENCE;
  const root = evidenceRoot();
  if (prior !== undefined) process.env.BENCH_EVIDENCE = prior;
  else delete process.env.BENCH_EVIDENCE;
  assert.equal(root, "/Volumes/ELEMENTS/EVIDENCE");
  assert.equal(root.includes("/tmp/"), false);
});

test("a live ear URL is rewritten to the file ear", async () => {
  const ear = await forensicFileEar("http://127.0.0.1:4850/live");
  assert.equal(ear, "http://127.0.0.1:4850/stt");
});
