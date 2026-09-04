export type SilenceSpan = { start: number; end: number };
export type SpeechSpan = { start: number; end: number };
export type SceneCut = { t: number };
export type Digest = { sha256: string; sha512: string };

export type CaseFile = {
  agency: string;
  caseId: string;
  exhibit: string;
  operator: string;
};

export type BenchMeta = {
  duration: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  sampleRate: number;
  bytes: number;
  name: string;
  mime: string;
};

export type PorchTake = {
  asSaid: string;
  rawEar: string;
  durationMs: number;
  honesty: {
    ear: "local" | "file" | "unseated";
    cloud: boolean;
    corti: "not-this-nerve";
    organ: "porch";
    github: "https://github.com/EverettNC/PORCH";
    wholeHouse: false;
    rule: string;
  };
};

export type ProcessStep = {
  n: number;
  tool: "ffmpeg" | "porch" | "hash" | "bag";
  argv: string[];
  code: number;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
};

export type Custody = {
  jobId: string;
  case: CaseFile;
  startedAt: string;
  finishedAt: string;
  timezone: "UTC";
  software: {
    name: "Bench";
    family: "christman-sound";
    ffmpeg: string;
    node: string;
  };
  steps: ProcessStep[];
  hashes: {
    original: Digest;
    evidenceWav: Digest;
    porchWav: Digest | null;
  };
  bag: string;
  porch: {
    organ: "porch";
    github: "https://github.com/EverettNC/PORCH";
    wholeHouse: false;
  };
  disclaimer: string;
};

export type VerifyItem = {
  name: string;
  ok: boolean;
  recorded: Digest;
  computed: Digest | null;
};

export type VerifyReport = {
  jobId: string;
  verifiedAt: string;
  ok: boolean;
  items: VerifyItem[];
};

export type BenchJob = {
  id: string;
  meta: BenchMeta;
  wav: { evidence: string; porch: string; evidenceBytes: number; porchBytes: number; original: string };
  cuts: Array<SceneCut & { thumb: string }>;
  silence: SilenceSpan[];
  speech: SpeechSpan[];
  porch: {
    seated: boolean;
    reason?: string;
    takes: Array<{ span: SpeechSpan; take: PorchTake | null; error?: string }>;
  };
  custody: Custody;
};
