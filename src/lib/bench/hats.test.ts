import assert from "node:assert/strict";
import { test } from "node:test";
import { hatsFromRecord, mergeHats, parseEnv, parseHatsFile } from "./hats.ts";

test("parse env, json, and merge hats", () => {
  const env = parseEnv(`
# comment
export PORCH_EAR_URL="http://127.0.0.1:4849/api/porch/stt"
NVIDIA_API_KEY=nvapi-secret
OLLAMA_HOST=http://127.0.0.1:11434
`);
  assert.equal(env.PORCH_EAR_URL, "http://127.0.0.1:4849/api/porch/stt");
  assert.equal(env.NVIDIA_API_KEY, "nvapi-secret");

  const fromEnv = parseHatsFile(`NVIDIA_API_KEY=abc\nPORCH_EAR_URL=http://ear`);
  assert.equal(fromEnv.nvidiaKey, "abc");
  assert.equal(fromEnv.porchEar, "http://ear");

  const fromJson = parseHatsFile(
    JSON.stringify({ nvidiaKey: "n", ollamaUrl: "http://127.0.0.1:11434" }),
    "hats.json",
  );
  assert.equal(fromJson.nvidiaKey, "n");
  assert.equal(fromJson.ollamaUrl, "http://127.0.0.1:11434");

  const merged = mergeHats(fromEnv, fromJson);
  assert.equal(merged.porchEar, "http://ear");
  assert.equal(merged.nvidiaKey, "n");
  assert.equal(merged.ollamaUrl, "http://127.0.0.1:11434");

  assert.equal(hatsFromRecord({ NGC_API_KEY: "x" }).nvidiaKey, "x");
});
