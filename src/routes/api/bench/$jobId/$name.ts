import { createFileRoute } from "@tanstack/react-router";
import { openJobFile, statJobFile } from "@/lib/bench/process.server";

function contentType(name: string) {
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".jpg")) return "image/jpeg";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (name.endsWith(".tgz")) return "application/gzip";
  return "application/octet-stream";
}

export const Route = createFileRoute("/api/bench/$jobId/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const st = await statJobFile(params.jobId, params.name);
        const stream = openJobFile(params.jobId, params.name);
        if (!st || !stream) return new Response("Not found", { status: 404 });
        return new Response(stream, {
          headers: {
            "content-type": contentType(params.name),
            "content-length": String(st.size),
            "content-disposition": `attachment; filename="${params.name}"`,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
