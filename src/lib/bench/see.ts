import { runBin } from "./ffmpeg.ts";
import { existsSync } from "node:fs";

/** At most 720 stills. 150 min → one frame every 12.5s. Short tapes → every 2s. */
export function seeIntervalSec(durationSec: number, maxStills = 720): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 5;
  return Math.max(2, durationSec / maxStills);
}

export function stillTime(index: number, intervalSec: number): number {
  return Math.max(0, index * intervalSec);
}

const DEFAULT_OCR_PY = "/Users/EverettN/Christman-Sound/christman_ocr_shared.py";
const DEFAULT_OCR_PYTHON = "/Users/EverettN/Christman-Sound/.venv/bin/python3";

export function resolveChristmanOcr(): string | null {
  const fromEnv = process.env.CHRISTMAN_OCR?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(DEFAULT_OCR_PY)) return DEFAULT_OCR_PY;
  return null;
}

export function resolveChristmanOcrPython(): string | null {
  const fromEnv = process.env.CHRISTMAN_OCR_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(DEFAULT_OCR_PYTHON)) return DEFAULT_OCR_PYTHON;
  return "python3";
}

export type OcrFrameRow = { file: string; text: string; confidence: number };

export function parseOcrFramesJson(raw: string): OcrFrameRow[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Christman OCR did not return a frame list.");
  return parsed.map((row) => {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      file: String(rec.file ?? ""),
      text: String(rec.text ?? "").replace(/\s+/g, " ").trim(),
      confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
    };
  });
}

export function textForStill(name: string, rows: OcrFrameRow[], lastText: string): { text: string; nextLast: string } {
  const row = rows.find((r) => r.file === name);
  const text = row?.text ?? "";
  if (!text) return { text: "", nextLast: lastText };
  if (text === lastText) return { text: "", nextLast: lastText };
  return { text, nextLast: text };
}

export async function ocrStills(dir: string, timeoutMs: number): Promise<OcrFrameRow[]> {
  const script = resolveChristmanOcr();
  const python = resolveChristmanOcrPython();
  if (!script || !python) return [];
  try {
    const result = await runBin(python, [script, "--frames", dir, "--json"], timeoutMs);
    if (result.code !== 0) return [];
    const jsonLine = result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .reverse()
      .find((l) => l.startsWith("["));
    if (!jsonLine) return [];
    return parseOcrFramesJson(jsonLine);
  } catch {
    return [];
  }
}
