import assert from "node:assert/strict";
import { test } from "node:test";
import { reconstructDialect } from "./dialect.ts";

test("Porch keeps dialect and recovers mangles without Whole House", () => {
  const empty = reconstructDialect("   ");
  assert.equal(empty.asSaid, "");

  const kept = reconstructDialect("I ain't fixin' to leave y'all");
  assert.match(kept.asSaid, /ain't/);

  const recovered = reconstructDialect("Broxton said Miss Reed the heptic note");
  assert.match(recovered.asSaid, /Brockston/);
  assert.match(recovered.asSaid, /misread/);
  assert.match(recovered.asSaid, /haptic/);
});
