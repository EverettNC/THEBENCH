import type { PorchCorrection } from "./types.ts";

const MANGLES: Array<{ re: RegExp; to: string; from: string; why: string }> = [
  { re: /\balpha\s*vox\b/gi, to: "AlphaVox", from: "Alpha Vox", why: "family name" },
  { re: /\bbroxton\b/gi, to: "Brockston", from: "Broxton", why: "family name" },
  { re: /\bcourtier\b/gi, to: "Corti", from: "courtier", why: "family name" },
  { re: /\bserafina\b/gi, to: "Seraphina", from: "Serafina", why: "family name" },
  { re: /\bmike could\b/gi, to: "might could", from: "Mike could", why: "dialect" },
  { re: /\bfixing to\b/gi, to: "fixin' to", from: "fixing to", why: "dialect" },
  { re: /\bmiss\s+reed\b/gi, to: "misread", from: "Miss Reed", why: "mouth-cooperation" },
  { re: /\bleaved\b/gi, to: "lived", from: "leaved", why: "mouth-cooperation" },
  { re: /\bhectic\s+feedback\b/gi, to: "haptic feedback", from: "hectic feedback", why: "mouth-cooperation" },
  { re: /\bheptic\b/gi, to: "haptic", from: "heptic", why: "mouth-cooperation" },
];

export function recoverMangles(text: string): { text: string; corrections: PorchCorrection[] } {
  let next = text;
  const corrections: PorchCorrection[] = [];
  for (const m of MANGLES) {
    m.re.lastIndex = 0;
    if (!m.re.test(next)) {
      m.re.lastIndex = 0;
      continue;
    }
    m.re.lastIndex = 0;
    next = next.replace(m.re, m.to);
    m.re.lastIndex = 0;
    corrections.push({ from: m.from, to: m.to, why: m.why });
  }
  return { text: next, corrections };
}
