import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { SpeechSpan } from "./parse";
import { windowsForEar } from "./parse";
import type { Hats } from "./hats";
import type { PorchTake } from "./types";
import { reconstructDialect } from "@/lib/porch/dialect";
import { PORCH_GITHUB, PORCH_HONESTY_RULE } from "@/lib/porch/types";
import { buildKeyterms } from "@/lib/porch/lexicon";
import { resolveFfmpeg, runBin } from "./ffmpeg";

export type { PorchTake };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function pickTranscript(body: unknown): string | null {
  const rec = asRecord(body);
  if (!rec) return null;
  if (typeof rec.text === "string") return rec.text;
  if (typeof rec.transcript === "string") return rec.transcript;
  if (typeof rec.asSaid === "string") return rec.asSaid;
  return null;
}

function isLoopback(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

export function seatedEar(explicit?: string) {
  return (explicit || process.env.PORCH_EAR_URL || process.env.FILAMENT_EAR_URL || "").trim();
}

function honesty(ear: PorchTake["honesty"]["ear"], cloud: boolean): PorchTake["honesty"] {
  return {
    ear,
    cloud,
    corti: "not-this-nerve",
    organ: "porch",
    github: PORCH_GITHUB,
    wholeHouse: false,
    rule: PORCH_HONESTY_RULE,
  };
}

async function transcribeClip(
  wav: Buffer,
  ear: string,
  filename: string,
  nvidiaKey: string,
  durationMs: number,
): Promise<PorchTake> {
  const form = new FormData();
  form.append("language", "en");
  form.append("filler_words", "true");
  for (const term of buildKeyterms()) form.append("keyterm", term);
  form.append("file", new File([new Uint8Array(wav)], filename, { type: "audio/wav" }));
  const headers: Record<string, string> = {};
  if (nvidiaKey) headers.Authorization = `Bearer ${nvidiaKey}`;
  const res = await fetch(ear, { method: "POST", body: form, headers });
  const raw = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(res.ok ? "The word-ear sent back silence." : `The word-ear failed (${res.status}).`);
  }
  if (!res.ok) throw new Error(`The word-ear failed (${res.status}).`);
  const text = pickTranscript(body);
  if (text === null) throw new Error("The word-ear sent back silence.");
  const layer = reconstructDialect(text);
  return {
    asSaid: layer.asSaid,
    rawEar: text,
    durationMs,
    honesty: honesty("file", !isLoopback(ear)),
  };
}

export async function runPorchOnWav(
  porchWavPath: string,
  speech: SpeechSpan[],
  hats: Hats,
  dir: string,
): Promise<{
  seated: boolean;
  reason?: string;
  takes: Array<{ span: SpeechSpan; take: PorchTake | null; error?: string }>;
}> {
  const ear = seatedEar(hats.porchEar);
  if (!ear) {
    return {
      seated: false,
      reason:
        "Porch is unseated. Seat EverettNC/THEFILAMENT as the ear, then Porch (EverettNC/PORCH) as the dialect. Not Whole House. Not :9785. Empty ear stays empty. No invented speech.",
      takes: [],
    };
  }

  const windows = windowsForEar(speech);
  if (!windows.length) {
    return { seated: true, reason: "No speech spans.", takes: [] };
  }

  const ffmpeg = resolveFfmpeg();
  const nvidiaKey = hats.nvidiaKey || process.env.NVIDIA_API_KEY || "";
  const takes: Array<{ span: SpeechSpan; take: PorchTake | null; error?: string }> = [];

  for (let i = 0; i < windows.length; i += 1) {
    const span = windows[i];
    if (!span) continue;
    const clip = join(dir, `ear_${String(i + 1).padStart(4, "0")}.wav`);
    const durationMs = Math.round((span.end - span.start) * 1000);
    try {
      const cut = await runBin(
        ffmpeg,
        [
          "-hide_banner",
          "-y",
          "-ss",
          span.start.toFixed(3),
          "-t",
          (span.end - span.start).toFixed(3),
          "-i",
          porchWavPath,
          "-acodec",
          "pcm_s16le",
          clip,
        ],
        180_000,
      );
      if (cut.code !== 0) {
        takes.push({ span, take: null, error: "Could not cut that speech window." });
        continue;
      }
      const wav = await readFile(clip);
      const take = await transcribeClip(wav, ear, "porch.wav", nvidiaKey, durationMs);
      takes.push({ span, take });
    } catch (err) {
      takes.push({
        span,
        take: null,
        error: err instanceof Error ? err.message : "The local word-ear could not be reached.",
      });
    } finally {
      await unlink(clip).catch(() => undefined);
    }
  }

  return { seated: true, takes };
}
