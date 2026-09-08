import { mkdir, writeFile, stat, readdir, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  clampSilence,
  parseDuration,
  parseScenes,
  parseSilence,
  parseFfprobe,
  parseStreams,
  speechFromSilence,
} from "./parse";
import { runPorchOnWav } from "./porch";
import { EMPTY_HATS, type Hats } from "./hats";
import { digestFile } from "./hash";
import { PORCH_GITHUB } from "@/lib/porch/types";
import { ffmpegTimeoutMs, MAX_TAPE_BYTES, TAPE_TOO_LARGE } from "./limits";
import { resolveFfmpeg, resolveFfprobe, runBin } from "./ffmpeg";
import { writeStreamToFile } from "./write-tape";
import { evidenceRoot, forensicFileEar, requireEvidenceRoot } from "./evidence";
import { ocrFrame, resolveTesseract, seeIntervalSec, stillTime } from "./see";
import type { BenchJob, CaseFile, Custody, Digest, DriftReport, ProcessStep, SceneCut, ScreenRead } from "./types";

export type { BenchJob } from "./types";

const ROOT = evidenceRoot();
const jobs = new Map<string, BenchJob>();
const FFMPEG = resolveFfmpeg();
const FFPROBE = resolveFfprobe();
const DISCLAIMER =
  "Forensic processing record for agency submission. Chain of custody, dual NIST hashes, original bytes preserved. Not an FDA-cleared medical device. Empty ear stays empty. No invented speech.";

const EMPTY_CASE: CaseFile = { agency: "", caseId: "", exhibit: "", operator: "" };

export type TapeSource = {
  name: string;
  mime: string;
  size: number;
  body: ReadableStream<Uint8Array>;
};

export { MAX_TAPE_BYTES, TAPE_TOO_LARGE };

export function jobDir(id: string) {
  return join(ROOT, id);
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export async function loadJob(id: string): Promise<BenchJob | null> {
  const mem = jobs.get(id);
  if (mem) return mem;
  try {
    const raw = await readFile(join(jobDir(id), "packet.json"), "utf8");
    const job = JSON.parse(raw) as BenchJob;
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
}

const ALLOWED_FILE =
  /^(original\.bin|evidence\.wav|porch\.wav|packet\.json|MANIFEST\.txt|REPORT\.txt|DRIFT\.txt|SCREEN\.txt|bag\.tgz|cut_\d{4}\.jpg|see_\d{4}\.jpg)$/;

export function jobFilePath(id: string, name: string): string | null {
  if (!ALLOWED_FILE.test(name)) return null;
  return join(jobDir(id), name);
}

export async function statJobFile(id: string, name: string) {
  const path = jobFilePath(id, name);
  if (!path) return null;
  try {
    const st = await stat(path);
    return { path, size: st.size };
  } catch {
    return null;
  }
}

export function openJobFile(id: string, name: string): ReadableStream<Uint8Array> | null {
  const path = jobFilePath(id, name);
  if (!path) return null;
  return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
}

async function step(
  log: ProcessStep[],
  tool: ProcessStep["tool"],
  bin: string,
  argv: string[],
  timeoutMs: number,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const result = await runBin(bin, argv, timeoutMs);
  log.push({
    n: log.length + 1,
    tool,
    argv: [bin, ...argv],
    code: result.code,
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
  });
  return result;
}

function manifestText(job: BenchJob) {
  const h = job.custody.hashes;
  const c = job.custody.case;
  return [
    "BENCH EVIDENCE BAG",
    `jobId: ${job.id}`,
    `agency: ${c.agency || "—"}`,
    `case: ${c.caseId || "—"}`,
    `exhibit: ${c.exhibit || "—"}`,
    `operator: ${c.operator || "—"}`,
    `started: ${job.custody.startedAt}`,
    `finished: ${job.custody.finishedAt}`,
    `timezone: UTC`,
    `ffmpeg: ${job.custody.software.ffmpeg}`,
    "",
    "HASHES (NIST FIPS 180-4)",
    `original.bin  SHA-256  ${h.original.sha256}`,
    `original.bin  SHA-512  ${h.original.sha512}`,
    `evidence.wav  SHA-256  ${h.evidenceWav.sha256}`,
    `evidence.wav  SHA-512  ${h.evidenceWav.sha512}`,
    h.porchWav
      ? `porch.wav     SHA-256  ${h.porchWav.sha256}\nporch.wav     SHA-512  ${h.porchWav.sha512}`
      : "porch.wav     —",
    "",
    "INDEPENDENT VERIFY",
    "  sha256sum original.bin evidence.wav porch.wav",
    "  sha512sum original.bin evidence.wav porch.wav",
    "Compare to this file and packet.json. A mismatch is a broken bag.",
    "",
    job.custody.disclaimer,
    `Porch: ${PORCH_GITHUB}`,
    `On disk: ${job.custody.disk}`,
    "",
  ].join("\n");
}

function ms(n: number | null) {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} ms`;
}

function driftLines(d: DriftReport) {
  return [
    `  A/V duration drift  ${ms(d.avDriftMs)}  (audio minus video)`,
    `  start skew          ${ms(d.startSkewMs)}  (audio start minus video start)`,
    `  frame-count drift   ${ms(d.frameDriftMs)}  (nb_frames/fps minus video duration)`,
    `  fps mode            ${d.fpsMode}  r=${d.rFps.toFixed(3)}  avg=${d.avgFps.toFixed(3)}`,
    `  video               ${d.videoSec ?? "—"}s  start ${d.videoStartSec ?? "—"}s  frames ${d.nbFrames ?? "—"}`,
    `  audio               ${d.audioSec ?? "—"}s  start ${d.audioStartSec ?? "—"}s  ${d.sampleRate ?? "—"} Hz`,
    `  container           ${d.containerSec}s`,
  ];
}

function screenText(job: BenchJob) {
  const lines = job.see.stills.filter((s) => s.text).map((s) => `${s.t.toFixed(2)}s\n${s.text}\n`);
  return [
    "BENCH SCREEN",
    `jobId: ${job.id}`,
    `tape: ${job.meta.name}`,
    `interval: ${job.see.intervalSec}s`,
    `stills: ${job.see.stills.length}`,
    "",
    "OCR of sampled frames. Tesseract. Not Porch. Empty frame stays empty. No invented story.",
    "",
    ...(lines.length ? lines : ["(no glyphs on sampled frames)"]),
    "",
    job.custody.disclaimer,
    "",
  ].join("\n");
}

function driftText(job: BenchJob) {
  return ["BENCH DRIFT", `jobId: ${job.id}`, `tape: ${job.meta.name}`, "", ...driftLines(job.drift), "", job.custody.disclaimer, ""].join(
    "\n",
  );
}

function reportText(job: BenchJob) {
  const porchLines = !job.porch.seated
    ? [job.porch.reason || "Porch unseated. Empty ear stays empty."]
    : job.porch.takes.length === 0
      ? [job.porch.reason || "No speech spans."]
      : job.porch.takes.map((t) => {
          const when = `${t.span.start.toFixed(2)}s–${t.span.end.toFixed(2)}s`;
          if (t.take?.asSaid) return `${when}\n${t.take.asSaid}`;
          return `${when}\n${t.error || "Empty ear stays empty."}`;
        });
  const cuts = job.cuts.map((c, i) => `  ${String(i + 1).padStart(2, "0")}  ${c.t.toFixed(3)}s`);
  return [
    "BENCH FORENSIC REPORT",
    `jobId: ${job.id}`,
    `tape: ${job.meta.name}`,
    `agency: ${job.custody.case.agency || "—"}`,
    `case: ${job.custody.case.caseId || "—"}`,
    `exhibit: ${job.custody.case.exhibit || "—"}`,
    `operator: ${job.custody.case.operator || "—"}`,
    `started: ${job.custody.startedAt}`,
    `finished: ${job.custody.finishedAt}`,
    `disk: ${job.custody.disk}`,
    "",
    "SEE",
    `  ${job.meta.width}×${job.meta.height}  ${job.meta.fps} fps  ${job.meta.videoCodec}`,
    `  duration ${job.meta.duration.toFixed(2)}s`,
    `  scene cuts ${job.cuts.length}`,
    ...(cuts.length ? cuts : ["  none at this threshold"]),
    `  stills every ${job.see.intervalSec}s  (${job.see.stills.length})`,
    ...job.see.stills
      .filter((s) => s.text)
      .slice(0, 40)
      .map((s) => `  ${s.t.toFixed(2)}s  ${s.text}`),
    "",
    "DRIFT",
    ...driftLines(job.drift),
    "",
    "HEAR",
    `  evidence.wav  ${job.wav.evidenceBytes} bytes  48 kHz stereo`,
    `  porch.wav     ${job.wav.porchBytes} bytes  16 kHz mono`,
    `  speech spans  ${job.speech.length}`,
    `  silence spans ${job.silence.length}`,
    "",
    "PORCH",
    ...porchLines,
    "",
    job.custody.disclaimer,
    "",
  ].join("\n");
}

export async function processTape(
  source: TapeSource,
  hats: Hats = EMPTY_HATS,
  caseFile: CaseFile = EMPTY_CASE,
): Promise<BenchJob> {
  if (source.size > MAX_TAPE_BYTES) throw new Error(TAPE_TOO_LARGE);
  requireEvidenceRoot();
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const dir = jobDir(id);
  await mkdir(dir, { recursive: true });
  const originalPath = join(dir, "original.bin");
  const bytes = await writeStreamToFile(source.body, originalPath);
  if (bytes === 0) throw new Error("Drop a tape.");
  const log: ProcessStep[] = [];

  const version = await step(log, "ffmpeg", FFMPEG, ["-version"], 30_000);
  const ffmpegLine = (version.stdout || version.stderr).split("\n")[0]?.trim() ?? "ffmpeg";

  const probe = await step(log, "ffmpeg", FFMPEG, ["-hide_banner", "-i", originalPath], 180_000);
  const duration = parseDuration(probe.stderr);
  const streams = parseStreams(probe.stderr);
  const longMs = ffmpegTimeoutMs(duration);

  const probed = await step(
    log,
    "ffprobe",
    FFPROBE,
    ["-hide_banner", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", originalPath],
    180_000,
  );
  const drift = parseFfprobe(probed.stdout || probed.stderr);

  const evidencePath = join(dir, "evidence.wav");
  const porchPath = join(dir, "porch.wav");
  const wav = await step(
    log,
    "ffmpeg",
    FFMPEG,
    [
      "-hide_banner",
      "-y",
      "-i",
      originalPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      evidencePath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      porchPath,
    ],
    longMs,
  );
  if (wav.code !== 0 && !(await exists(evidencePath))) {
    throw new Error("Could not pull a WAV from that tape.");
  }

  const silenceRun = await step(
    log,
    "ffmpeg",
    FFMPEG,
    ["-hide_banner", "-i", evidencePath, "-af", "silencedetect=noise=-30dB:d=0.4", "-f", "null", "-"],
    longMs,
  );
  const total = duration || parseDuration(silenceRun.stderr);
  const silence = clampSilence(parseSilence(silenceRun.stderr), total);
  const speech = speechFromSilence(total, silence);

  const cutPattern = join(dir, "cut_%04d.jpg");
  const sceneRun = await step(
    log,
    "ffmpeg",
    FFMPEG,
    [
      "-hide_banner",
      "-y",
      "-i",
      originalPath,
      "-vf",
      "select='gt(scene,0.35)',scale=480:-1,showinfo",
      "-fps_mode",
      "vfr",
      "-q:v",
      "4",
      cutPattern,
    ],
    longMs,
  );
  const rawCuts = parseScenes(sceneRun.stderr);
  const cuts: Array<SceneCut & { thumb: string }> = [];
  for (let i = 0; i < rawCuts.length; i += 1) {
    const cut = rawCuts[i];
    const name = `cut_${String(i + 1).padStart(4, "0")}.jpg`;
    if (cut && (await exists(join(dir, name)))) {
      cuts.push({ t: cut.t, thumb: `/api/bench/${id}/${name}` });
    }
  }

  const intervalSec = seeIntervalSec(total || duration);
  const seePattern = join(dir, "see_%04d.jpg");
  await step(
    log,
    "ffmpeg",
    FFMPEG,
    [
      "-hide_banner",
      "-y",
      "-i",
      originalPath,
      "-vf",
      `fps=1/${intervalSec},scale=960:-1`,
      "-q:v",
      "4",
      seePattern,
    ],
    longMs,
  );
  const tesseract = resolveTesseract();
  const stills: ScreenRead[] = [];
  const ocrStart = new Date().toISOString();
  const tOcr = Date.now();
  let lastText = "";
  for (let i = 0; i < 720; i += 1) {
    const name = `see_${String(i + 1).padStart(4, "0")}.jpg`;
    const path = join(dir, name);
    if (!(await exists(path))) break;
    const t = stillTime(i, intervalSec);
    let text = "";
    if (tesseract) {
      try {
        text = await ocrFrame(path, tesseract);
      } catch {
        text = "";
      }
    }
    if (text && text === lastText) text = "";
    if (text) lastText = text;
    stills.push({ t, thumb: `/api/bench/${id}/${name}`, text });
  }
  log.push({
    n: log.length + 1,
    tool: "see",
    argv: ["tesseract", "stdout", `${stills.length} stills`, `${intervalSec}s`],
    code: 0,
    startedAt: ocrStart,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - tOcr,
  });

  const evidenceBytes = (await stat(evidencePath)).size;
  const porchBytes = (await exists(porchPath)) ? (await stat(porchPath)).size : 0;

  const hashStart = new Date().toISOString();
  const tHash = Date.now();
  const originalDigest: Digest = await digestFile(originalPath);
  const evidenceDigest: Digest = await digestFile(evidencePath);
  const porchDigest: Digest | null = porchBytes ? await digestFile(porchPath) : null;
  log.push({
    n: log.length + 1,
    tool: "hash",
    argv: ["sha256", "sha512", "original.bin", "evidence.wav", "porch.wav"],
    code: 0,
    startedAt: hashStart,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - tHash,
  });

  const porchStart = new Date().toISOString();
  const tPorch = Date.now();
  const fileEar = await forensicFileEar(hats.porchEar);
  const earHats = { ...hats, porchEar: fileEar };
  const porch = await runPorchOnWav(porchPath, speech, earHats, dir);
  log.push({
    n: log.length + 1,
    tool: "porch",
    argv: ["porch", fileEar ? "file-ear" : "unseated"],
    code: porch.seated && porch.takes.length ? 0 : porch.seated ? 1 : 0,
    startedAt: porchStart,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - tPorch,
  });

  const custody: Custody = {
    jobId: id,
    case: {
      agency: caseFile.agency.trim(),
      caseId: caseFile.caseId.trim(),
      exhibit: caseFile.exhibit.trim(),
      operator: caseFile.operator.trim(),
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    timezone: "UTC",
    software: {
      name: "Bench",
      family: "christman-sound",
      ffmpeg: ffmpegLine,
      node: process.version,
    },
    steps: log,
    hashes: {
      original: originalDigest,
      evidenceWav: evidenceDigest,
      porchWav: porchDigest,
    },
    bag: `/api/bench/${id}/bag.tgz`,
    disk: dir,
    porch: { organ: "porch", github: PORCH_GITHUB, wholeHouse: false },
    disclaimer: DISCLAIMER,
  };

  const job: BenchJob = {
    id,
    meta: {
      duration: total,
      videoCodec: streams.videoCodec,
      audioCodec: streams.audioCodec,
      width: streams.width,
      height: streams.height,
      fps: streams.fps,
      sampleRate: 48000,
      bytes,
      name: source.name || "tape",
      mime: source.mime || "application/octet-stream",
    },
    wav: {
      evidence: `/api/bench/${id}/evidence.wav`,
      porch: `/api/bench/${id}/porch.wav`,
      original: `/api/bench/${id}/original.bin`,
      evidenceBytes,
      porchBytes,
    },
    cuts,
    see: { intervalSec, stills },
    drift,
    silence,
    speech,
    porch,
    custody,
  };

  await writeFile(join(dir, "packet.json"), JSON.stringify(job, null, 2));
  await writeFile(join(dir, "MANIFEST.txt"), manifestText(job));
  await writeFile(join(dir, "REPORT.txt"), reportText(job));
  await writeFile(join(dir, "DRIFT.txt"), driftText(job));
  await writeFile(join(dir, "SCREEN.txt"), screenText(job));
  const bagItems = ["original.bin", "evidence.wav", "packet.json", "MANIFEST.txt", "REPORT.txt", "DRIFT.txt", "SCREEN.txt"];
  if (await exists(join(dir, "porch.wav"))) bagItems.push("porch.wav");
  const cutFiles = (await readdir(dir)).filter((n) => /^cut_\d{4}\.jpg$/.test(n)).sort();
  const seeFiles = (await readdir(dir)).filter((n) => /^see_\d{4}\.jpg$/.test(n)).sort();
  bagItems.push(...cutFiles, ...seeFiles);
  const bagPath = join(dir, "bag.tgz");
  const bagStart = new Date().toISOString();
  const tBag = Date.now();
  const bag = await runBin("tar", ["-czf", bagPath, "-C", dir, ...bagItems], longMs);
  job.custody.steps.push({
    n: job.custody.steps.length + 1,
    tool: "bag",
    argv: ["tar", "-czf", "bag.tgz"],
    code: bag.code,
    startedAt: bagStart,
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - tBag,
  });
  job.custody.finishedAt = new Date().toISOString();
  await writeFile(join(dir, "packet.json"), JSON.stringify(job, null, 2));
  await writeFile(join(dir, "REPORT.txt"), reportText(job));
  await writeFile(join(dir, "DRIFT.txt"), driftText(job));
  await writeFile(join(dir, "SCREEN.txt"), screenText(job));
  jobs.set(id, job);
  return job;
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
