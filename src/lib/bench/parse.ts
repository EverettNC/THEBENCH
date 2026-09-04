import type { SceneCut, SilenceSpan, SpeechSpan } from "./types";

export type { SceneCut, SilenceSpan, SpeechSpan };

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const VIDEO_RE = /Stream #\d+:\d+(?:\[\w+\])?: Video:\s*([^,]+).*?(\d{2,5})x(\d{2,5}).*?([\d.]+)\s*fps/;
const AUDIO_RE = /Stream #\d+:\d+(?:\[\w+\])?: Audio:\s*([^,]+).*?(\d+)\s*Hz/;
const SILENCE_START_RE = /silence_start:\s*([\d.]+)/g;
const SILENCE_END_RE = /silence_end:\s*([\d.]+)/g;
const PTS_RE = /pts_time:([\d.]+)/g;

export function parseDuration(log: string): number {
  const m = DURATION_RE.exec(log);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function parseStreams(log: string): {
  videoCodec: string;
  width: number;
  height: number;
  fps: number;
  audioCodec: string;
  sampleRate: number;
} {
  const v = VIDEO_RE.exec(log);
  const a = AUDIO_RE.exec(log);
  return {
    videoCodec: v?.[1]?.trim() ?? "unknown",
    width: v ? Number(v[2]) : 0,
    height: v ? Number(v[3]) : 0,
    fps: v ? Number(v[4]) : 0,
    audioCodec: a?.[1]?.trim() ?? "none",
    sampleRate: a ? Number(a[2]) : 0,
  };
}

export function parseSilence(log: string): SilenceSpan[] {
  const starts = [...log.matchAll(SILENCE_START_RE)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(SILENCE_END_RE)].map((m) => Number(m[1]));
  const n = Math.min(starts.length, ends.length);
  const spans: SilenceSpan[] = [];
  for (let i = 0; i < n; i += 1) {
    if (ends[i] > starts[i]) spans.push({ start: starts[i], end: ends[i] });
  }
  if (starts.length === ends.length + 1) {
    // open silence at EOF — caller can clamp with duration
    spans.push({ start: starts[starts.length - 1], end: starts[starts.length - 1] });
  }
  return spans;
}

export function clampSilence(spans: SilenceSpan[], duration: number): SilenceSpan[] {
  return spans
    .map((s) => ({
      start: Math.max(0, s.start),
      end: s.end <= s.start ? duration : Math.min(duration, s.end),
    }))
    .filter((s) => s.end - s.start >= 0.05);
}

export function speechFromSilence(duration: number, silence: SilenceSpan[]): SpeechSpan[] {
  if (duration <= 0) return [];
  const sorted = [...silence].sort((a, b) => a.start - b.start);
  const speech: SpeechSpan[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start - cursor >= 0.12) speech.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (duration - cursor >= 0.12) speech.push({ start: cursor, end: duration });
  return speech;
}

export function parseScenes(log: string): SceneCut[] {
  const times = [...log.matchAll(PTS_RE)].map((m) => Number(m[1]));
  const unique: SceneCut[] = [];
  let last = -1;
  for (const t of times) {
    if (t - last < 0.08) continue;
    unique.push({ t });
    last = t;
  }
  return unique;
}
