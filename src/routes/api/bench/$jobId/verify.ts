import { createFileRoute } from "@tanstack/react-router";
import { verifyJob } from "@/lib/bench/verify";

export const Route = createFileRoute("/api/bench/$jobId/verify")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const report = await verifyJob(params.jobId);
        if (!report) return new Response(JSON.stringify({ ok: false, error: "No bag." }), { status: 404 });
        return new Response(JSON.stringify(report), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
