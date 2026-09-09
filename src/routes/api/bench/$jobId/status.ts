import { createFileRoute } from "@tanstack/react-router";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { jobDir, loadJob } from "@/lib/bench/process.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/bench/$jobId/status")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const job = await loadJob(params.jobId);
        if (job) return json({ ok: true, status: "done", job });
        const dir = jobDir(params.jobId);
        try {
          const fail = await readFile(join(dir, "FAIL.txt"), "utf8");
          return json({ ok: false, status: "failed", error: fail.trim() }, 500);
        } catch {
          /* no fail marker */
        }
        try {
          await stat(join(dir, "original.bin"));
          return json({ ok: true, status: "dissecting", id: params.jobId });
        } catch {
          return json({ ok: false, error: "No tape." }, 404);
        }
      },
    },
  },
});
