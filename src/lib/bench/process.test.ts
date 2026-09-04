import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseDuration, parseScenes, parseSilence, speechFromSilence } from "./parse.ts";

const FFMPEG = "/usr/local/bin/ffmpeg";

test("ffmpeg extracts wav, silence, and a scene cut from a synthetic tape", async (t) => {
  if (spawnSync(FFMPEG, ["-version"]).status !== 0) {
    t.skip("ffmpeg not installed");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "bench-test-"));
  const tape = join(dir, "tape.mp4");
  const wav = join(dir, "evidence.wav");
  try {
    const make = spawnSync(
      FFMPEG,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x90:d=1:r=12",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=1:r=12",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=16000:cl=mono:d=0.8",
        "-filter_complex",
        "[0:v][2:v]concat=n=2:v=1:a=0[v];[1:a][3:a]concat=n=2:v=0:a=1[a]",
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        tape,
      ],
      { encoding: "utf8" },
    );
    assert.equal(make.status, 0, make.stderr);

    const wavRun = spawnSync(
      FFMPEG,
      ["-y", "-i", tape, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wav],
      { encoding: "utf8" },
    );
    assert.equal(wavRun.status, 0, wavRun.stderr);
    assert.match(wavRun.stderr, /Audio: pcm_s16le/);

    const sil = spawnSync(
      FFMPEG,
      ["-i", wav, "-af", "silencedetect=noise=-30dB:d=0.3", "-f", "null", "-"],
      { encoding: "utf8" },
    );
    const spans = parseSilence(sil.stderr);
    const duration = parseDuration(sil.stderr) || parseDuration(wavRun.stderr);
    assert.ok(duration > 1);
    const speech = speechFromSilence(duration, spans);
    assert.ok(speech.length >= 1);

    const scenes = spawnSync(
      FFMPEG,
      [
        "-y",
        "-i",
        tape,
        "-vf",
        "select='gt(scene,0.2)',showinfo",
        "-fps_mode",
        "vfr",
        join(dir, "cut_%04d.jpg"),
      ],
      { encoding: "utf8" },
    );
    const cuts = parseScenes(scenes.stderr);
    assert.ok(cuts.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
