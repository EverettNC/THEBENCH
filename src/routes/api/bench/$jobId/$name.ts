import { createFileRoute } from "@tanstack/react-router";
import { readJobFile } from "@/lib/bench/process.server";

export const Route = createFileRoute("/api/bench/$jobId/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const buf = await readJobFile(params.jobId, params.name);
        if (!buf) return new Response("Not found", { status: 404 });
        const type = params.name.endsWith(".wav")
          ? "audio/wav"
          : params.name.endsWith(".jpg")
            ? "image/jpeg"
            : params.name.endsWith(".json")
              ? "application/json"
              : params.name.endsWith(".txt")
                ? "text/plain; charset=utf-8"
                : params.name.endsWith(".tgz")
                  ? "application/gzip"
                  : "application/octet-stream";
        return new Response(new Uint8Array(buf), {
          headers: {
            "content-type": type,
            "content-disposition": `attachment; filename="${params.name}"`,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
