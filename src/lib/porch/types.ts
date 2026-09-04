/**
 * Porch — the word-ear. EverettNC/PORCH.
 * Not Whole House. Not :9785.
 */
export const PORCH_ORGAN = "porch" as const;
export const PORCH_FAMILY = "christman-sound" as const;
export const PORCH_GITHUB = "https://github.com/EverettNC/PORCH";

export type HonestyEar = "local" | "sample" | "file" | "unseated";
export type HonestyDialect = "passthrough";

export type PorchCorrection = {
  from: string;
  to: string;
  why: string;
};

export type LexiconEntry = {
  said: string;
  keep: string;
  note: string;
};

export const PORCH_HONESTY_RULE =
  "Porch is the word-ear. EverettNC/PORCH. Not Whole House. Not :9785. The tape stays on this machine. Dialect is kept. Whisper is not in this body.";
