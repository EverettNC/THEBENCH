import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOcrFramesJson, seeIntervalSec, stillTime, textForStill } from "./see.ts";

test("see interval keeps stills bounded for a 150-minute tape", () => {
  assert.equal(seeIntervalSec(6), 2);
  assert.equal(seeIntervalSec(9000), 12.5);
  assert.ok(9000 / seeIntervalSec(9000) <= 720);
  assert.equal(stillTime(0, 5), 0);
  assert.equal(stillTime(3, 5), 15);
});

test("Christman OCR frame JSON maps by filename and drops repeats", () => {
  const rows = parseOcrFramesJson(
    JSON.stringify([
      { file: "see_0001.jpg", text: "hello", confidence: 0.9 },
      { file: "see_0002.jpg", text: "hello", confidence: 0.91 },
      { file: "see_0003.jpg", text: "", confidence: 0 },
    ]),
  );
  const a = textForStill("see_0001.jpg", rows, "");
  assert.equal(a.text, "hello");
  const b = textForStill("see_0002.jpg", rows, a.nextLast);
  assert.equal(b.text, "");
  const c = textForStill("see_0003.jpg", rows, b.nextLast);
  assert.equal(c.text, "");
});
