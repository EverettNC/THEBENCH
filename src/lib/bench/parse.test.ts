import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampSilence,
  parseDuration,
  parseScenes,
  parseSilence,
  parseStreams,
  speechFromSilence,
  windowsForEar,
} from "./parse.ts";
import { ffmpegTimeoutMs, MAX_EAR_WINDOW_SEC } from "./limits.ts";

test("parse duration, streams, silence, scenes", () => {
  const probe = `
Duration: 00:01:02.40, start: 0.000000, bitrate: 1234 kb/s
    Stream #0:0[0x1]: Video: h264 (High), yuv420p, 1920x1080, 29.97 fps, 29.97 tbr
    Stream #0:1[0x2]: Audio: aac (LC), 48000 Hz, stereo, fltp
  `;
  assert.equal(parseDuration(probe).toFixed(2), "62.40");
  const streams = parseStreams(probe);
  assert.equal(streams.videoCodec, "h264 (High)");
  assert.equal(streams.width, 1920);
  assert.equal(streams.height, 1080);
  assert.equal(streams.audioCodec, "aac (LC)");
  assert.equal(streams.sampleRate, 48000);

  const sil = `
[silencedetect @ 0] silence_start: 1.20
[silencedetect @ 0] silence_end: 2.00 | silence_duration: 0.80
[silencedetect @ 0] silence_start: 5.00
[silencedetect @ 0] silence_end: 5.50 | silence_duration: 0.50
  `;
  const spans = parseSilence(sil);
  assert.deepEqual(spans, [
    { start: 1.2, end: 2 },
    { start: 5, end: 5.5 },
  ]);
  const speech = speechFromSilence(8, clampSilence(spans, 8));
  assert.equal(speech[0]?.start, 0);
  assert.equal(speech[0]?.end, 1.2);
  assert.equal(speech.at(-1)?.end, 8);

  const scenes = parseScenes("pts_time:0.00 n:0\npts_time:1.04 n:1\npts_time:1.05 n:2\npts_time:3.20 n:3");
  assert.deepEqual(
    scenes.map((s) => s.t),
    [0, 1.04, 3.2],
  );
});

test("150-minute speech is windowed for the ear, not capped at 12", () => {
  const longTape = windowsForEar([{ start: 0, end: 9000 }]);
  assert.equal(longTape.length, 9000 / MAX_EAR_WINDOW_SEC);
  assert.equal(longTape[0]?.start, 0);
  assert.equal(longTape[0]?.end, 60);
  assert.equal(longTape.at(-1)?.end, 9000);
  assert.equal(
    windowsForEar([
      { start: 0, end: 0.2 },
      { start: 1, end: 1.5 },
    ]).length,
    1,
  );
  assert.equal(ffmpegTimeoutMs(0), 300_000);
  assert.equal(ffmpegTimeoutMs(10), 300_000);
  assert.equal(ffmpegTimeoutMs(9000), 13_500_000);
  assert.equal(ffmpegTimeoutMs(20_000), 14_400_000);
});
