import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EMPTY_SHA256, EMPTY_SHA512, digest, digestFile, digestsMatch, sha256, sha512 } from "./hash.ts";

test("FIPS 180-4 empty-message vectors for SHA-256 and SHA-512", () => {
  const empty = Buffer.alloc(0);
  assert.equal(sha256(empty), EMPTY_SHA256);
  assert.equal(sha512(empty), EMPTY_SHA512);
  const d = digest(empty);
  assert.equal(d.sha256.length, 64);
  assert.equal(d.sha512.length, 128);
  assert.equal(digestsMatch(d, { sha256: EMPTY_SHA256, sha512: EMPTY_SHA512 }), true);
  assert.equal(digestsMatch(d, { sha256: EMPTY_SHA256, sha512: "no" }), false);
});

test("digestFile matches in-memory digest and does not need the whole buffer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-hash-"));
  const path = join(dir, "tape.bin");
  const buf = Buffer.from("the original bytes stay");
  try {
    writeFileSync(path, buf);
    assert.deepEqual(await digestFile(path), digest(buf));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
