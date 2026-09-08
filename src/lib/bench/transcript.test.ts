import assert from "node:assert/strict";
import { test } from "node:test";
import { pickWords, srtStamp, transcriptSrt, transcriptTxt } from "./transcript.ts";

test("srt stamp and transcript files keep timed speech", () => {
  assert.equal(srtStamp(65.5), "00:01:05,500");
  const takes = [
    {
      span: { start: 0, end: 2 },
      take: {
        asSaid: "hello desk",
        rawEar: "hello desk",
        durationMs: 2000,
        honesty: {
          ear: "file" as const,
          cloud: false,
          corti: "not-this-nerve" as const,
          organ: "porch" as const,
          github: "https://github.com/EverettNC/PORCH" as const,
          wholeHouse: false as const,
          rule: "x",
        },
      },
    },
    { span: { start: 2, end: 4 }, take: null },
  ];
  const txt = transcriptTxt(takes);
  assert.match(txt, /hello desk/);
  assert.equal(txt.includes("2.00s–4.00s"), false);
  const srt = transcriptSrt(takes);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
});

test("filament words are offset onto the tape", () => {
  const words = pickWords({ words: [{ word: "hello", start: 0.2, end: 0.5 }] }, 60);
  assert.equal(words[0]?.word, "hello");
  assert.equal(words[0]?.start, 60.2);
});
