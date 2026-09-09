import { createFileRoute } from "@tanstack/react-router";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { finishLandedTape, landTape, MAX_TAPE_BYTES, TAPE_TOO_LARGE } from "@/lib/bench/process.server";
import { hatsFromHeaders } from "@/lib/bench/hats";
import type { CaseFile } from "@/lib/bench/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function header(request: Request, key: string) {
  return (request.headers.get(key) || "").trim();
}

function filenameFrom(request: Request) {
  const raw = header(request, "x-bench-filename") || "tape";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function caseFromHeaders(request: Request): CaseFile {
  return {
    agency: header(request, "x-bench-agency"),
    caseId: header(request, "x-bench-case"),
    exhibit: header(request, "x-bench-exhibit"),
    operator: header(request, "x-bench-operator"),
  };
}

export const Route = createFileRoute("/api/bench/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") || 0);
        if (Number.isFinite(declared) && declared > MAX_TAPE_BYTES) {
          return json({ ok: false, error: TAPE_TOO_LARGE }, 413);
        }
        if (!request.body) {
          return json({ ok: false, error: "Drop a tape." }, 400);
        }
        try {
          const hats = hatsFromHeaders(request.headers);
          const caseFile = caseFromHeaders(request);
          const landed = await landTape({
            name: filenameFrom(request),
            mime: request.headers.get("content-type") || "application/octet-stream",
            size: Number.isFinite(declared) ? declared : 0,
            body: request.body,
          });
          void finishLandedTape(landed, hats, caseFile).catch(async (err) => {
            const message = err instanceof Error ? err.message : "The bench failed.";
            await writeFile(join(landed.dir, "FAIL.txt"), `${message}\n`);
          });
          return json({
            ok: true,
            status: "dissecting",
            job: { id: landed.id, status: "dissecting", name: landed.name, bytes: landed.bytes },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "The bench failed.";
          const status = message === TAPE_TOO_LARGE ? 413 : 500;
          return json({ ok: false, error: message }, status);
        }
      },
    },
  },
});
