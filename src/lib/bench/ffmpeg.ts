import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

export function resolveFfmpeg(): string {
  const fromEnv = process.env.FFMPEG?.trim();
  if (fromEnv) return fromEnv;
  for (const p of ["/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg";
}

export function resolveFfprobe(): string {
  const fromEnv = process.env.FFPROBE?.trim();
  if (fromEnv) return fromEnv;
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg.endsWith("ffmpeg")) return `${ffmpeg.slice(0, -6)}ffprobe`;
  return "ffprobe";
}

export function runBin(
  bin: string,
  args: string[],
  timeoutMs: number,
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
