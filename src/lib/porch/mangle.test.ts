import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverMangles } from "./mangle.ts";

test("clean text comes back untouched with no corrections", () => {
  const { text, corrections } = recoverMangles("I ain't fixin' to leave y'all");
  assert.equal(text, "I ain't fixin' to leave y'all");
  assert.deepEqual(corrections, []);
});

test("empty ear stays empty", () => {
  const { text, corrections } = recoverMangles("");
  assert.equal(text, "");
  assert.deepEqual(corrections, []);
});

test("family names are recovered", () => {
  const { text } = recoverMangles("Broxton and Serafina met alpha vox and courtier");
  assert.match(text, /Brockston/);
  assert.match(text, /Seraphina/);
  assert.match(text, /AlphaVox/);
  assert.match(text, /Corti/);
});

test("dialect mangles are recovered", () => {
  const { text } = recoverMangles("He mike could be fixing to go");
  assert.match(text, /might could/);
  assert.match(text, /fixin' to/);
});

test("mouth-cooperation mangles are recovered", () => {
  const { text } = recoverMangles("Miss Reed the heptic note and leaved there with hectic feedback");
  assert.match(text, /misread/);
  assert.match(text, /haptic/);
  assert.match(text, /lived/);
  assert.match(text, /haptic feedback/);
});

test("every correction reports from, to and why", () => {
  const { corrections } = recoverMangles("Broxton said heptic");
  assert.equal(corrections.length, 2);
  for (const c of corrections) {
    assert.ok(c.from.length > 0);
    assert.ok(c.to.length > 0);
    assert.ok(c.why.length > 0);
  }
  assert.deepEqual(
    corrections.map((c) => c.to),
    ["Brockston", "haptic"],
  );
});

test("a mangle is reported once no matter how many times it is said", () => {
  const { text, corrections } = recoverMangles("Broxton, Broxton, and Broxton again");
  assert.equal(text, "Brockston, Brockston, and Brockston again");
  assert.equal(corrections.length, 1);
});

test("matching is case-insensitive and global across repeat calls", () => {
  const first = recoverMangles("BROXTON and heptic");
  assert.match(first.text, /Brockston/);
  assert.match(first.text, /haptic/);

  const second = recoverMangles("BROXTON and heptic");
  assert.equal(second.text, first.text);
  assert.deepEqual(second.corrections, first.corrections);
});

test("word boundaries are respected", () => {
  const { text, corrections } = recoverMangles("skeptical");
  assert.equal(text, "skeptical");
  assert.deepEqual(corrections, []);
});
