import { mkdir, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import {
  clampSilence,
  parseDuration,
  parseScenes,
  parseSilence,
  parseStreams,
  speechFromSilence,
} from "./parse";
import { runPorchOnWav } from "./porch";
import { EMPTY_HATS, type Hats } from "./hats";
import { digestFile } from "./hash";
import { PORCH_GITHUB } from "@/lib/porch/types";
import { ffmpegTimeoutMs, MAX_TAPE_BYTES, TAPE_TOO_LARGE } from "./limits";
import { resolveFfmpeg, runBin } from "./ffmpeg";
import { writeStreamToFile } from "./write-tape";
import type { BenchJob, CaseFile, Custody, Digest, ProcessStep, SceneCut } from "./types";

export type { BenchJob } from "./types";

const ROOT = join(tmpdir(), "bench");
const jobs = new Map<string, BenchJob>();
const FFMPEG = resolveFfmpeg();
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

const ALLOWED_FILE = /^(original\.bin|evidence\.wav|porch\.wav|packet\.json|MANIFEST\.txt|bag\.tgz|cut_\d{4}\.jpg)$/;

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
    "",
  ].join("\n");
}

export async function processTape(
  source: TapeSource,
  hats: Hats = EMPTY_HATS,
  caseFile: CaseFile = EMPTY_CASE,
): Promise<BenchJob> {
  if (source.size > MAX_TAPE_BYTES) throw new Error(TAPE_TOO_LARGE);
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
  const porch = await runPorchOnWav(porchPath, speech, hats, dir);
  log.push({
    n: log.length + 1,
    tool: "porch",
    argv: ["porch", hats.porchEar ? "seated" : "unseated"],
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
    silence,
    speech,
    porch,
    custody,
  };

  await writeFile(join(dir, "packet.json"), JSON.stringify(job, null, 2));
  await writeFile(join(dir, "MANIFEST.txt"), manifestText(job));
  const bagItems = ["original.bin", "evidence.wav", "packet.json", "MANIFEST.txt"];
  if (await exists(join(dir, "porch.wav"))) bagItems.push("porch.wav");
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
