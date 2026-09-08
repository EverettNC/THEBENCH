import type { SpeechSpan } from "./parse";
import type { EarWord, PorchTake } from "./types";

export type TranscriptTake = {
  span: SpeechSpan;
  take: PorchTake | null;
  error?: string;
};

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

export function srtStamp(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function vttStamp(sec: number): string {
  return srtStamp(sec).replace(",", ".");
}

export function saidOf(row: TranscriptTake): string {
  return (row.take?.asSaid || row.take?.rawEar || "").trim();
}

export function transcriptTxt(takes: TranscriptTake[]): string {
  const lines: string[] = ["BENCH TRANSCRIPT", "Empty ear stays empty. No invented speech.", ""];
  let any = false;
  for (const row of takes) {
    const said = saidOf(row);
    if (!said) continue;
    any = true;
    lines.push(`${row.span.start.toFixed(2)}s–${row.span.end.toFixed(2)}s`);
    lines.push(said);
    lines.push("");
  }
  if (!any) lines.push("Empty ear stays empty.");
  return lines.join("\n") + "\n";
}

export function transcriptSrt(takes: TranscriptTake[]): string {
  const chunks: string[] = [];
  let n = 0;
  for (const row of takes) {
    const said = saidOf(row);
    if (!said) continue;
    n += 1;
    chunks.push(`${n}\n${srtStamp(row.span.start)} --> ${srtStamp(row.span.end)}\n${said}\n`);
  }
  return chunks.join("\n");
}

export function transcriptVtt(takes: TranscriptTake[]): string {
  const body = transcriptSrt(takes).replace(/,/g, ".");
  return `WEBVTT\n\n${body}`;
}

export function pickWords(body: unknown, offsetSec: number): EarWord[] {
  if (typeof body !== "object" || body === null || !("words" in body)) return [];
  const raw = (body as { words?: unknown }).words;
  if (!Array.isArray(raw)) return [];
  const out: EarWord[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const word = String(rec.word || rec.text || "").trim();
    if (!word) continue;
    const start = Number(rec.start ?? rec.begin ?? 0);
    const end = Number(rec.end ?? rec.start ?? start);
    if (!Number.isFinite(start)) continue;
    out.push({
      word,
      start: start + offsetSec,
      end: (Number.isFinite(end) ? end : start) + offsetSec,
    });
  }
  return out;
}
