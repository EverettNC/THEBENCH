import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { AudioLines, Film, Scissors } from "lucide-react";
import type { BenchJob, CaseFile, VerifyReport } from "@/lib/bench/types";
import { HatsDrop, loadHats, saveHats, takeHatsDrop } from "@/components/bench/HatsDrop";
import { mergeHats, parseHatsFile, type Hats } from "@/lib/bench/hats";
import { cn, fmtTime } from "@/lib/utils";

type IngestResponse = { ok: true; job: BenchJob } | { ok: false; error: string };

export function BenchDesk() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<BenchJob | null>(null);
  const [hats, setHats] = useState<Hats>(() => ({ porchEar: "", nvidiaKey: "", ollamaUrl: "" }));

  useEffect(() => {
    const loaded = loadHats();
    setHats(loaded);
  }, []);

  function writeHats(next: Hats) {
    setHats(next);
    saveHats(next);
  }
  const [name, setName] = useState<string | null>(null);
  const [kase, setKase] = useState<CaseFile>({ agency: "", caseId: "", exhibit: "", operator: "" });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bench-case");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CaseFile>;
      setKase({
        agency: parsed.agency ?? "",
        caseId: parsed.caseId ?? "",
        exhibit: parsed.exhibit ?? "",
        operator: parsed.operator ?? "",
      });
    } catch {
      /* empty */
    }
  }, []);

  function writeCase(next: CaseFile) {
    setKase(next);
    window.localStorage.setItem("bench-case", JSON.stringify(next));
  }

  async function ingest(file: File) {
    setBusy(true);
    setError(null);
    setJob(null);
    setName(file.name);
    saveHats(hats);
    const form = new FormData();
    form.append("file", file);
    form.append("ear", hats.porchEar);
    form.append("nvidia", hats.nvidiaKey);
    form.append("ollama", hats.ollamaUrl);
    form.append("agency", kase.agency);
    form.append("caseId", kase.caseId);
    form.append("exhibit", kase.exhibit);
    form.append("operator", kase.operator);
    try {
      const res = await fetch("/api/bench/ingest", { method: "POST", body: form });
      const body = (await res.json()) as IngestResponse;
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setJob(body.job);
    } catch {
      setError("The bench could not take that tape.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files[0];
    if (takeHatsDrop(file) && file) {
      void file.text().then((text) => {
        writeHats(mergeHats(hats, parseHatsFile(text, file.name)));
      });
      return;
    }
    if (file) void ingest(file);
  }

  function onPick(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (file) void ingest(file);
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="relative overflow-hidden border-b border-line bg-black">
        <iframe
          title="The Filament — housing v2"
          src="/filament-live.html?v=nogoal"
          allow="microphone; autoplay"
          className="block h-[min(82vh,900px)] w-full border-0 bg-black"
        />
      </header>

      <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-5 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-10 lg:py-12">
        <aside className="flex flex-col gap-8">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-accent">Evidence bench</p>
            <h1 className="mt-3 font-display text-5xl italic leading-[0.9] tracking-tight text-fg sm:text-6xl">Intake</h1>
            <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-muted">
              Original bytes stay. Dual NIST hashes. Process log. Bag. Porch hears the words. Empty ear stays empty.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-subtle">
            <li className="flex items-center gap-2">
              <Film className="size-3.5 text-accent" aria-hidden />
              Scene score
            </li>
            <li className="flex items-center gap-2">
              <AudioLines className="size-3.5 text-accent" aria-hidden />
              PCM 16-bit
            </li>
            <li className="flex items-center gap-2">
              <Scissors className="size-3.5 text-accent" aria-hidden />
              Dialect stays
            </li>
          </ul>
          <CaseStrip value={kase} onChange={writeCase} />
        </aside>

        <div className="flex flex-col gap-4">
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setHover(true);
            }}
            onDragLeave={() => setHover(false)}
            onDrop={onDrop}
            className={cn(
              "gate relative overflow-hidden rounded-lg border bg-surface transition-[border-color,transform] duration-200 ease-(--ease-out)",
              hover ? "border-accent" : "border-line",
            )}
          >
            <div className="sprocket border-b border-line/80" />
            <div className="relative min-h-56 px-6 py-9 sm:min-h-72 sm:px-8">
              {busy ? <div className="scan pointer-events-none absolute inset-y-0 left-0 w-1/3" /> : null}
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-accent">
                {busy ? "On the bench" : hover ? "Release the tape" : "Intake"}
              </p>
              <p className="mt-3 font-display text-3xl italic text-fg sm:text-4xl">
                {busy ? "Pulling the WAV." : "Drop a video."}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                mp4, mov, mkv, webm. 256 MB. Evidence at 48 kHz stereo. Porch at 16 kHz mono.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center rounded-sm bg-accent px-5 text-sm font-medium text-bg duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                >
                  {busy ? "Hold." : "Choose tape"}
                </button>
                {name ? <span className="font-mono text-xs text-muted">{name}</span> : null}
              </div>
            </div>
            <div className="sprocket border-t border-line/80" />
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mp4,.mov,.mkv,.webm,.m4v"
              className="sr-only"
              onChange={onPick}
            />
          </section>

          <HatsDrop hats={hats} onChange={writeHats} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-16 lg:px-10">
        {error ? (
          <p className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-fg" role="alert">
            {error}
          </p>
        ) : null}
        {job ? <Evidence job={job} /> : <EmptyRail />}
      </div>
    </div>
  );
}

function EmptyRail() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-paper text-ink">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink/50">Exhibit</p>
        <p className="font-mono text-[0.65rem] text-ink/40">empty</p>
      </div>
      <div className="ledger min-h-28 px-5 py-6">
        <p className="font-display text-2xl italic text-ink/80">No tape on the bench.</p>
        <p className="mt-2 max-w-lg text-sm text-ink/55">
          Drop a video. The bag keeps original bytes, dual hashes, and the process log. Nothing is invented.
        </p>
      </div>
    </div>
  );
}

function Evidence({ job }: { job: BenchJob }) {
  const duration = job.meta.duration || 1;
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">Tape rail</p>
          <p className="font-mono text-xs tabular-nums text-muted">{job.meta.duration.toFixed(2)}s</p>
        </div>
        <TapeRail job={job} duration={duration} />
        <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
          <Stat label="Picture" value={job.meta.width ? `${job.meta.width}×${job.meta.height}` : "—"} />
          <Stat label="Video" value={job.meta.videoCodec} />
          <Stat label="Audio" value={job.meta.audioCodec} />
          <Stat label="Rate" value={`${job.meta.fps || "—"} fps`} />
        </div>
      </section>

      <section className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl italic text-fg">WAV</h2>
            <p className="mt-1 text-sm text-muted">PCM 16-bit. Evidence 48 kHz stereo. Porch 16 kHz mono.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={job.wav.evidence}
              className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg transition-colors duration-150 hover:border-accent"
            >
              evidence.wav · {(job.wav.evidenceBytes / 1024).toFixed(0)} KB
            </a>
            <a
              href={job.wav.porch}
              className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg transition-colors duration-150 hover:border-accent"
            >
              porch.wav · {(job.wav.porchBytes / 1024).toFixed(0)} KB
            </a>
          </div>
        </div>
        <audio className="mt-4 w-full" controls src={job.wav.evidence} />
      </section>

      <section className="rounded-md border border-line bg-surface p-5">
        <h2 className="font-display text-2xl italic text-fg">Cuts</h2>
        <p className="mt-1 text-sm text-muted">Hard cuts on the picture. ffmpeg scene score. Not a guess.</p>
        {job.cuts.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No hard cuts at this threshold.</p>
        ) : (
          <ul className="mt-5 flex gap-3 overflow-x-auto pb-1">
            {job.cuts.map((c, i) => (
              <li key={`${c.t}-${c.thumb}`} className="w-40 shrink-0 overflow-hidden rounded-sm border border-line bg-raised">
                <div className="sprocket bg-surface" />
                <img src={c.thumb} alt="" className="aspect-video w-full object-cover" />
                <div className="sprocket bg-surface" />
                <p className="px-2 py-2 font-mono text-xs tabular-nums text-muted">
                  {String(i + 1).padStart(2, "0")} · {fmtTime(c.t)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SpanCard title="Silence" items={job.silence} empty="No silence spans." />
        <SpanCard title="Speech" items={job.speech} empty="No speech spans." />
      </section>

      <section className="rounded-md border border-line bg-paper px-6 py-7 text-ink shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-3xl italic">Porch</h2>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ink/50">as said</p>
        </div>
        {!job.porch.seated ? (
          <p className="mt-4 max-w-prose text-base leading-relaxed text-ink/80">{job.porch.reason}</p>
        ) : job.porch.takes.length === 0 ? (
          <p className="mt-4 max-w-prose text-base leading-relaxed text-ink/80">
            {job.porch.reason ?? "Empty ear stays empty."}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-6">
            {job.porch.takes.map((t, i) => (
              <li key={i} className="border-t border-ink/10 pt-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink/50">
                  {fmtTime(t.span.start)} – {fmtTime(t.span.end)}
                </p>
                {t.take?.asSaid ? (
                  <p className="mt-2 whitespace-pre-wrap font-display text-xl leading-snug">{t.take.asSaid}</p>
                ) : (
                  <p className="mt-2 text-sm text-ink/70">{t.error ?? "Empty ear stays empty."}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-line bg-surface p-5">
        <CustodyPanel job={job} />
      </section>
    </div>
  );
}

function TapeRail({ job, duration }: { job: BenchJob; duration: number }) {
  return (
    <div className="relative mx-4 my-5 h-12 overflow-hidden rounded-sm bg-bg">
      {job.speech.map((s) => (
        <div
          key={`sp-${s.start}-${s.end}`}
          className="absolute top-2 h-8 rounded-sm bg-speech/70"
          style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }}
        />
      ))}
      {job.silence.map((s) => (
        <div
          key={`si-${s.start}-${s.end}`}
          className="absolute top-4 h-4 bg-line"
          style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }}
        />
      ))}
      {job.cuts.map((c) => (
        <div
          key={`c-${c.t}`}
          className="absolute top-0 h-full w-px bg-warn"
          style={{ left: `${(c.t / duration) * 100}%` }}
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-4 py-3 not-last:border-r max-sm:odd:border-r sm:border-r sm:last:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className="mt-1 truncate font-mono text-sm tabular-nums text-fg">{value}</p>
    </div>
  );
}

function CaseStrip({ value, onChange }: { value: CaseFile; onChange: (next: CaseFile) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(
        [
          ["agency", "Agency", "FDA / DOJ"],
          ["caseId", "Case", "number"],
          ["exhibit", "Exhibit", "EX-001"],
          ["operator", "Operator", "who ran it"],
        ] as const
      ).map(([key, label, placeholder]) => (
        <div key={key}>
          <label htmlFor={`case-${key}`} className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-subtle">
            {label}
          </label>
          <input
            id={`case-${key}`}
            value={value[key]}
            placeholder={placeholder}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="mt-1 h-11 w-full rounded-sm border border-line bg-surface px-3 font-mono text-sm text-fg placeholder:text-subtle"
          />
        </div>
      ))}
    </div>
  );
}

function CustodyPanel({ job }: { job: BenchJob }) {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bench/${job.id}/verify`);
      setReport((await res.json()) as VerifyReport);
    } catch {
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  const h = job.custody.hashes;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl italic text-fg">Custody</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{job.custody.disclaimer}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void verify()}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg hover:border-accent disabled:opacity-40"
          >
            {busy ? "Recomputing…" : "Verify hashes"}
          </button>
          <a
            href={`/api/bench/${job.id}/MANIFEST.txt`}
            className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg hover:border-accent"
          >
            MANIFEST.txt
          </a>
          <a
            href={`/api/bench/${job.id}/bag.tgz`}
            className="inline-flex min-h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-bg"
          >
            Evidence bag
          </a>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <Hash label="Job" value={job.id} />
        <Hash label="Case" value={job.custody.case.caseId || "—"} />
        <Hash label="Exhibit" value={job.custody.case.exhibit || "—"} />
        <Hash label="Operator" value={job.custody.case.operator || "—"} />
        <Hash label="Started (UTC)" value={job.custody.startedAt} />
        <Hash label="Finished (UTC)" value={job.custody.finishedAt} />
        <Hash label="Original SHA-256" value={h.original.sha256} />
        <Hash label="Original SHA-512" value={h.original.sha512} />
        <Hash label="Evidence WAV SHA-256" value={h.evidenceWav.sha256} />
        <Hash label="Evidence WAV SHA-512" value={h.evidenceWav.sha512} />
      </dl>

      {report ? (
        <p className={cn("mt-4 font-mono text-sm", report.ok ? "text-warn" : "text-danger")}>
          {report.ok
            ? `Verified ${report.verifiedAt}. Every stored byte matches the packet.`
            : `BROKEN BAG ${report.verifiedAt}. A hash does not match. Do not file this.`}
        </p>
      ) : null}

      <ol className="mt-5 divide-y divide-line border-y border-line">
        {job.custody.steps.map((s) => (
          <li key={s.n} className="flex min-h-11 items-center justify-between gap-3 py-2 font-mono text-xs">
            <span className="text-fg">
              {String(s.n).padStart(2, "0")} {s.tool} · exit {s.code}
            </span>
            <span className="text-muted">{s.elapsedMs} ms</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-xs text-subtle">
        {job.custody.software.ffmpeg} · {job.custody.porch.github}
      </p>
    </>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-fg">{value}</dd>
    </div>
  );
}

function SpanCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ start: number; end: number }>;
  empty: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <h2 className="font-display text-2xl italic text-fg">{title}</h2>
      {!items.length ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
          {items.map((s) => (
            <li
              key={`${title}-${s.start}-${s.end}`}
              className="flex min-h-11 items-center justify-between gap-3 py-2 font-mono text-sm tabular-nums"
            >
              <span className="text-fg">
                {fmtTime(s.start)} – {fmtTime(s.end)}
              </span>
              <span className="text-muted">{(s.end - s.start).toFixed(2)}s</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
