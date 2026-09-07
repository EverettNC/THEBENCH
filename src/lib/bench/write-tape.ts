import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { MAX_TAPE_BYTES, TAPE_TOO_LARGE } from "./limits.ts";

async function abandon(out: ReturnType<typeof createWriteStream>, path: string) {
  if (!out.destroyed) out.destroy();
  await Promise.race([once(out, "close"), once(out, "error")]).catch(() => undefined);
  await unlink(path).catch(() => undefined);
}

export async function writeStreamToFile(
  body: ReadableStream<Uint8Array>,
  path: string,
  maxBytes = MAX_TAPE_BYTES,
): Promise<number> {
  const out = createWriteStream(path);
  const reader = body.getReader();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > maxBytes) {
        await reader.cancel().catch(() => undefined);
        await abandon(out, path);
        throw new Error(TAPE_TOO_LARGE);
      }
      const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      if (!out.write(buf)) await once(out, "drain");
    }
    out.end();
    await finished(out);
    return written;
  } catch (err) {
    if (!(err instanceof Error && err.message === TAPE_TOO_LARGE)) {
      await abandon(out, path);
    }
    throw err;
  }
}
