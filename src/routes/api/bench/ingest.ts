import { createFileRoute } from "@tanstack/react-router";
import { processTape } from "@/lib/bench/process.server";
import { EMPTY_HATS, type Hats } from "@/lib/bench/hats";
import type { CaseFile } from "@/lib/bench/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function field(form: FormData, key: string) {
  return typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
}

function hatsFromForm(form: FormData): Hats {
  return {
    porchEar: field(form, "ear") || EMPTY_HATS.porchEar,
    nvidiaKey: field(form, "nvidia"),
    ollamaUrl: field(form, "ollama"),
  };
}

function caseFromForm(form: FormData): CaseFile {
  return {
    agency: field(form, "agency"),
    caseId: field(form, "caseId"),
    exhibit: field(form, "exhibit"),
    operator: field(form, "operator"),
  };
}

export const Route = createFileRoute("/api/bench/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return json({ ok: false, error: "Drop a tape." }, 400);
        }
        try {
          const job = await processTape(file, hatsFromForm(form), caseFromForm(form));
          return json({ ok: true, job });
        } catch (err) {
          const message = err instanceof Error ? err.message : "The bench failed.";
          return json({ ok: false, error: message }, 500);
        }
      },
    },
  },
});
