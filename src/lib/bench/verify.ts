import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { digest, digestsMatch } from "./hash";
import { getJob, jobDir } from "./process.server";
import type { Digest, VerifyItem, VerifyReport } from "./types";

async function item(name: string, recorded: Digest | null, path: string): Promise<VerifyItem> {
  if (!recorded) {
    return { name, ok: true, recorded: { sha256: "", sha512: "" }, computed: null };
  }
  try {
    const computed = digest(await readFile(path));
    return { name, ok: digestsMatch(recorded, computed), recorded, computed };
  } catch {
    return { name, ok: false, recorded, computed: null };
  }
}

export async function verifyJob(id: string): Promise<VerifyReport | null> {
  const job = getJob(id);
  if (!job) return null;
  const dir = jobDir(id);
  const items = await Promise.all([
    item("original.bin", job.custody.hashes.original, join(dir, "original.bin")),
    item("evidence.wav", job.custody.hashes.evidenceWav, join(dir, "evidence.wav")),
    item("porch.wav", job.custody.hashes.porchWav, join(dir, "porch.wav")),
  ]);
  return {
    jobId: id,
    verifiedAt: new Date().toISOString(),
    ok: items.every((i) => i.ok),
    items,
  };
}
