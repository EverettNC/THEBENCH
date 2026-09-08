import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function ping(url: string): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/bench/probe")({
  server: {
    handlers: {
      GET: async () => {
        const filament = await ping("http://127.0.0.1:4850/health");
        return json({ filament: { seated: filament.ok, status: filament.status } });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as { ollamaUrl?: string };
        const ollamaUrl = (body.ollamaUrl ?? "").trim().replace(/\/$/, "");
        const filament = await ping("http://127.0.0.1:4850/health");
        if (!ollamaUrl) {
          return json({ ollama: { seated: false }, filament: { seated: filament.ok, status: filament.status } });
        }
        const tags = await ping(`${ollamaUrl}/api/tags`);
        return json({
          ollama: { seated: tags.ok, status: tags.status },
          filament: { seated: filament.ok, status: filament.status },
        });
      },
    },
  },
});
