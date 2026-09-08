import assert from "node:assert/strict";
import { test } from "node:test";
import { seeIntervalSec, stillTime } from "./see.ts";

test("see interval keeps stills bounded for a 150-minute tape", () => {
  assert.equal(seeIntervalSec(6), 2);
  assert.equal(seeIntervalSec(9000), 12.5);
  assert.ok(9000 / seeIntervalSec(9000) <= 720);
  assert.equal(stillTime(0, 5), 0);
  assert.equal(stillTime(3, 5), 15);
});
