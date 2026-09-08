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
  windowsCovering,
  parseFfprobe,
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

  const ffmpeg8 = parseStreams(`
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 320x180 [SAR 1:1 DAR 16:9], 5 kb/s, 12 fps, 12 tbr
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 40 kb/s
  `);
  assert.equal(ffmpeg8.videoCodec, "h264 (High) (avc1 / 0x31637661)");
  assert.equal(ffmpeg8.width, 320);
  assert.equal(ffmpeg8.height, 180);
  assert.equal(ffmpeg8.fps, 12);
  assert.equal(ffmpeg8.audioCodec, "aac (LC) (mp4a / 0x6134706D)");
  assert.equal(ffmpeg8.sampleRate, 44100);

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
  assert.equal(windowsCovering(0).length, 0);
  assert.equal(windowsCovering(125, 60).length, 3);
  assert.equal(windowsCovering(125, 60)[2]?.end, 125);
  assert.equal(ffmpegTimeoutMs(0), 300_000);
  assert.equal(ffmpegTimeoutMs(10), 300_000);
  assert.equal(ffmpegTimeoutMs(9000), 13_500_000);
  assert.equal(ffmpegTimeoutMs(20_000), 14_400_000);
});

test("ffprobe records A/V drift, start skew, and VFR", () => {
  const drifted = parseFfprobe(
    JSON.stringify({
      format: { duration: "10.200000" },
      streams: [
        {
          codec_type: "video",
          duration: "10.200000",
          start_time: "0.000000",
          nb_frames: "306",
          avg_frame_rate: "24/1",
          r_frame_rate: "30/1",
        },
        {
          codec_type: "audio",
          duration: "10.000000",
          start_time: "0.040000",
          sample_rate: "48000",
        },
      ],
    }),
  );
  assert.equal(drifted.fpsMode, "vfr");
  assert.ok((drifted.avDriftMs ?? 0) < -150);
  assert.ok((drifted.startSkewMs ?? 0) > 30);
  assert.equal(drifted.sampleRate, 48000);
});
