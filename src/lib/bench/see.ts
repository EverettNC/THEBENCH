import { runBin } from "./ffmpeg.ts";
import { existsSync } from "node:fs";

/** At most 720 stills. 150 min → one frame every 12.5s. Short tapes → every 2s. */
export function seeIntervalSec(durationSec: number, maxStills = 720): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 5;
  return Math.max(2, durationSec / maxStills);
}

export function resolveTesseract(): string | null {
  const fromEnv = process.env.TESSERACT?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of ["/usr/local/bin/tesseract", "/opt/homebrew/bin/tesseract"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function stillTime(index: number, intervalSec: number): number {
  return Math.max(0, index * intervalSec);
}

export async function ocrFrame(path: string, tesseract: string): Promise<string> {
  const result = await runBin(tesseract, [path, "stdout", "-l", "eng", "--psm", "6"], 30_000);
  return (result.stdout || "").replace(/\s+/g, " ").trim();
}

