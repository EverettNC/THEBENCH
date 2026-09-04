import type { LexiconEntry } from "./types.ts";

export const FAMILY_NAMES = [
  "Everett",
  "Christman",
  "Harper",
  "Lucas",
  "Benjamin",
  "Brockston",
  "AlphaVox",
  "AlphaWolf",
  "Inferno",
  "Giuseppe",
  "Sierra",
  "Seraphina",
  "Eruptor",
  "Corti",
  "Lucent",
  "OpenSmell",
  "Derek C",
  "Constance",
  "Cletus",
  "Penny",
  "Cochlea",
  "Porch",
  "Canal",
  "Opus",
] as const;

export const DIALECT_KEEP: LexiconEntry[] = [
  { said: "ain't", keep: "ain't", note: "negation. not 'isn't'." },
  { said: "y'all", keep: "y'all", note: "plural you." },
  { said: "fixin' to", keep: "fixin' to", note: "about to." },
  { said: "might could", keep: "might could", note: "double modal. keep both." },
  { said: "reckon", keep: "reckon", note: "think / suppose." },
  { said: "cain't", keep: "cain't", note: "cannot." },
  { said: "holler", keep: "holler", note: "call out, or the hollow." },
  { said: "yonder", keep: "yonder", note: "over there." },
];

export const MOUTH_COOPERATION: LexiconEntry[] = [
  { said: "live", keep: "live", note: "LONG I /laɪv/. NEVER leave." },
  { said: "lived", keep: "lived", note: "/laɪvd/." },
  { said: "read", keep: "read", note: "past tense is RED /rɛd/." },
  { said: "misread", keep: "misread", note: "always MISRED. never Miss Reed." },
  { said: "haptic", keep: "haptic", note: "HAP-tic. never hectic." },
];

export const DEFAULT_LEXICON: LexiconEntry[] = [...DIALECT_KEEP, ...MOUTH_COOPERATION];

export function buildKeyterms(extra: LexiconEntry[] = []): string[] {
  const fromLexicon = [...DEFAULT_LEXICON, ...extra].flatMap((e) => [e.said, e.keep]);
  const all = [...FAMILY_NAMES, ...fromLexicon];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    const k = t.trim();
    if (!k || k.length > 50) continue;
    const id = k.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(k);
    if (out.length >= 100) break;
  }
  return out;
}
