import type { DriftReport, SceneCut, SilenceSpan, SpeechSpan } from "./types";

export type { SceneCut, SilenceSpan, SpeechSpan };

const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const VIDEO_RE =
  /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Video:\s*([^,]+).*?(\d{2,5})x(\d{2,5}).*?([\d.]+)\s*fps/;
const AUDIO_RE = /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:\s*([^,]+).*?(\d+)\s*Hz/;
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

/** Cut long speech into ear-sized windows. 2h of talk is 120 clips, not one POST. */
export function windowsForEar(speech: SpeechSpan[], maxSec = 60): SpeechSpan[] {
  const cap = maxSec > 0 ? maxSec : 60;
  const out: SpeechSpan[] = [];
  for (const s of speech) {
    if (s.end - s.start < 0.4) continue;
    let t = s.start;
    while (t < s.end) {
      const end = Math.min(s.end, t + cap);
      if (end - t >= 0.4) out.push({ start: t, end });
      t = end;
    }
  }
  return out;
}

export function parseRate(raw: string | undefined): number {
  if (!raw || raw === "0/0" || raw === "N/A") return 0;
  if (raw.includes("/")) {
    const [a, b] = raw.split("/");
    const n = Number(a);
    const d = Number(b);
    return d ? n / d : 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && value !== "N/A") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseFfprobe(raw: string): DriftReport {
  const empty: DriftReport = {
    containerSec: 0,
    videoSec: null,
    audioSec: null,
    videoStartSec: null,
    audioStartSec: null,
    avDriftMs: null,
    startSkewMs: null,
    expectedVideoSec: null,
    frameDriftMs: null,
    fpsMode: "unknown",
    rFps: 0,
    avgFps: 0,
    nbFrames: null,
    sampleRate: null,
  };
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return empty;
  }
  if (typeof body !== "object" || body === null) return empty;
  const rec = body as { format?: { duration?: unknown; start_time?: unknown }; streams?: unknown };
  const streams = Array.isArray(rec.streams) ? rec.streams : [];
  const video = streams.find((s) => typeof s === "object" && s !== null && (s as { codec_type?: string }).codec_type === "video") as
    | Record<string, unknown>
    | undefined;
  const audio = streams.find((s) => typeof s === "object" && s !== null && (s as { codec_type?: string }).codec_type === "audio") as
    | Record<string, unknown>
    | undefined;
  const containerSec = num(rec.format?.duration) ?? 0;
  const videoSec = num(video?.duration);
  const audioSec = num(audio?.duration);
  const videoStartSec = num(video?.start_time);
  const audioStartSec = num(audio?.start_time);
  const avgFps = parseRate(typeof video?.avg_frame_rate === "string" ? video.avg_frame_rate : undefined);
  const rFps = parseRate(typeof video?.r_frame_rate === "string" ? video.r_frame_rate : undefined);
  const nbFrames = num(video?.nb_frames);
  const fps = avgFps || rFps;
  const expectedVideoSec = nbFrames !== null && fps > 0 ? nbFrames / fps : null;
  let fpsMode: DriftReport["fpsMode"] = "unknown";
  if (avgFps > 0 && rFps > 0) fpsMode = Math.abs(avgFps - rFps) < 0.05 ? "cfr" : "vfr";
  return {
    containerSec,
    videoSec,
    audioSec,
    videoStartSec,
    audioStartSec,
    avDriftMs: videoSec !== null && audioSec !== null ? (audioSec - videoSec) * 1000 : null,
    startSkewMs: videoStartSec !== null && audioStartSec !== null ? (audioStartSec - videoStartSec) * 1000 : null,
    expectedVideoSec,
    frameDriftMs: expectedVideoSec !== null && videoSec !== null ? (expectedVideoSec - videoSec) * 1000 : null,
    fpsMode,
    rFps,
    avgFps,
    nbFrames,
    sampleRate: num(audio?.sample_rate),
  };
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
