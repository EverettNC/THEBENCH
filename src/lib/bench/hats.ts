export type Hats = {
  porchEar: string;
  nvidiaKey: string;
  ollamaUrl: string;
};

export const EMPTY_HATS: Hats = { porchEar: "", nvidiaKey: "", ollamaUrl: "" };
export const HATS_KEY = "bench-hats";

const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=\s*(.*?)\s*$/;

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = ENV_LINE.exec(line);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function pick(map: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const v = map[name]?.trim();
    if (v) return v;
  }
  return "";
}

export function hatsFromRecord(map: Record<string, unknown>): Hats {
  const str: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string") str[k] = v;
  }
  return {
    porchEar: pick(str, ["porchEar", "PORCH_EAR_URL", "FILAMENT_EAR_URL", "PORCH_EAR"]),
    nvidiaKey: pick(str, ["nvidiaKey", "NVIDIA_API_KEY", "NGC_API_KEY", "NIM_API_KEY"]),
    ollamaUrl: pick(str, ["ollamaUrl", "OLLAMA_HOST", "OLLAMA_URL", "OLLAMA_BASE_URL"]),
  };
}

export function parseHatsFile(text: string, filename = ""): Hats {
  const trimmed = text.trim();
  if (!trimmed) return { ...EMPTY_HATS };
  if (trimmed.startsWith("{") || filename.toLowerCase().endsWith(".json")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return hatsFromRecord(parsed as Record<string, unknown>);
      }
    } catch {
      // fall through to env
    }
  }
  return hatsFromRecord(parseEnv(trimmed));
}

export function mergeHats(base: Hats, incoming: Hats): Hats {
  return {
    porchEar: incoming.porchEar || base.porchEar,
    nvidiaKey: incoming.nvidiaKey || base.nvidiaKey,
    ollamaUrl: incoming.ollamaUrl || base.ollamaUrl,
  };
}

export function hatsSeated(hats: Hats) {
  return {
    porch: Boolean(hats.porchEar),
    nvidia: Boolean(hats.nvidiaKey),
    ollama: Boolean(hats.ollamaUrl),
  };
}

export function isHatsFilename(name: string) {
  const n = name.toLowerCase();
  return (
    n.endsWith(".env") ||
    n.endsWith(".json") ||
    n.endsWith(".txt") ||
    n.includes("hat") ||
    n.includes("nvidia") ||
    n.includes("ollama") ||
    n.includes("porch")
  );
}

export function exportHats(hats: Hats) {
  return `# Bench hats — keep on this machine
PORCH_EAR_URL=${hats.porchEar}
NVIDIA_API_KEY=${hats.nvidiaKey}
OLLAMA_HOST=${hats.ollamaUrl}
`;
}
