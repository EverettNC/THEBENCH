import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
import { digest } from "./hash";
import { PORCH_GITHUB } from "@/lib/porch/types";
import type { BenchJob, CaseFile, Custody, Digest, ProcessStep, SceneCut } from "./types";

export type { BenchJob } from "./types";

const ROOT = join(tmpdir(), "bench");
const jobs = new Map<string, BenchJob>();
const FFMPEG = "/usr/local/bin/ffmpeg";
const MAX_BYTES = 256 * 1024 * 1024;
const DISCLAIMER =
  "Forensic processing record for agency submission. Chain of custody, dual NIST hashes, original bytes preserved. Not an FDA-cleared medical device. Empty ear stays empty. No invented speech.";

const EMPTY_CASE: CaseFile = { agency: "", caseId: "", exhibit: "", operator: "" };

function run(
  bin: string,
  args: string[],
  timeoutMs = 180_000,
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

export function jobDir(id: string) {
  return join(ROOT, id);
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

const ALLOWED_FILE = /^(original\.bin|evidence\.wav|porch\.wav|packet\.json|MANIFEST\.txt|bag\.tgz|cut_\d{4}\.jpg)$/;

export async function readJobFile(id: string, name: string): Promise<Buffer | null> {
  if (!ALLOWED_FILE.test(name)) return null;
  try {
    return await readFile(join(jobDir(id), name));
  } catch {
    return null;
  }
}

async function step(
  log: ProcessStep[],
  tool: ProcessStep["tool"],
  bin: string,
  argv: string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const result = await run(bin, argv);
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
  file: File,
  hats: Hats = EMPTY_HATS,
  caseFile: CaseFile = EMPTY_CASE,
): Promise<BenchJob> {
  if (file.size > MAX_BYTES) throw new Error("Tape is over 256 MB. Cut it first.");
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const dir = jobDir(id);
  await mkdir(dir, { recursive: true });
  const originalPath = join(dir, "original.bin");
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(originalPath, buf);
  const log: ProcessStep[] = [];

  const version = await step(log, "ffmpeg", FFMPEG, ["-version"]);
  const ffmpegLine = (version.stdout || version.stderr).split("\n")[0]?.trim() ?? "ffmpeg";

  const probe = await step(log, "ffmpeg", FFMPEG, ["-hide_banner", "-i", originalPath]);
  const duration = parseDuration(probe.stderr);
  const streams = parseStreams(probe.stderr);

  const evidencePath = join(dir, "evidence.wav");
  const porchPath = join(dir, "porch.wav");
  const wav = await step(log, "ffmpeg", FFMPEG, [
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
  ]);
  if (wav.code !== 0 && !(await exists(evidencePath))) {
    throw new Error("Could not pull a WAV from that tape.");
  }

  const silenceRun = await step(log, "ffmpeg", FFMPEG, [
    "-hide_banner",
    "-i",
    evidencePath,
    "-af",
    "silencedetect=noise=-30dB:d=0.4",
    "-f",
    "null",
    "-",
  ]);
  const total = duration || parseDuration(silenceRun.stderr);
  const silence = clampSilence(parseSilence(silenceRun.stderr), total);
  const speech = speechFromSilence(total, silence);

  const cutPattern = join(dir, "cut_%04d.jpg");
  const sceneRun = await step(log, "ffmpeg", FFMPEG, [
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
  ]);
  const rawCuts = parseScenes(sceneRun.stderr);
  const cuts: Array<SceneCut & { thumb: string }> = [];
  for (let i = 0; i < rawCuts.length; i += 1) {
    const name = `cut_${String(i + 1).padStart(4, "0")}.jpg`;
    if (await exists(join(dir, name))) {
      cuts.push({ t: rawCuts[i].t, thumb: `/api/bench/${id}/${name}` });
    }
  }

  const evidenceBytes = (await stat(evidencePath)).size;
  const porchBytes = (await exists(porchPath)) ? (await stat(porchPath)).size : 0;
  const evidenceBuf = await readFile(evidencePath);
  const porchBuf = porchBytes ? await readFile(porchPath) : Buffer.alloc(0);

  const hashStart = new Date().toISOString();
  const tHash = Date.now();
  const originalDigest: Digest = digest(buf);
  const evidenceDigest: Digest = digest(evidenceBuf);
  const porchDigest: Digest | null = porchBytes ? digest(porchBuf) : null;
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
  const porch = await runPorchOnWav(porchPath, speech, hats);
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
      bytes: buf.byteLength,
      name: file.name || "tape",
      mime: file.type || "application/octet-stream",
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
  const bag = await run("tar", ["-czf", bagPath, "-C", dir, ...bagItems]);
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
