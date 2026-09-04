import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  EMPTY_HATS,
  HATS_KEY,
  exportHats,
  hatsSeated,
  isHatsFilename,
  mergeHats,
  parseHatsFile,
  type Hats,
} from "@/lib/bench/hats";
import { cn } from "@/lib/utils";

type Probe = { ollama: { seated: boolean; status?: number } } | null;

export function loadHats(): Hats {
  if (typeof window === "undefined") return { ...EMPTY_HATS };
  try {
    const raw = window.localStorage.getItem(HATS_KEY);
    if (raw) return mergeHats(EMPTY_HATS, JSON.parse(raw) as Hats);
    const legacy = window.localStorage.getItem("porch-ear");
    if (legacy) return { ...EMPTY_HATS, porchEar: legacy };
  } catch {
    /* keep empty */
  }
  return { ...EMPTY_HATS };
}

export function saveHats(hats: Hats) {
  window.localStorage.setItem(HATS_KEY, JSON.stringify(hats));
}

export function HatsDrop({
  hats,
  onChange,
}: {
  hats: Hats;
  onChange: (next: Hats) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [probe, setProbe] = useState<Probe>(null);
  const seated = hatsSeated(hats);

  useEffect(() => {
    if (!hats.ollamaUrl) {
      setProbe(null);
      return;
    }
    const t = window.setTimeout(() => {
      void fetch("/api/bench/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ollamaUrl: hats.ollamaUrl }),
      })
        .then((r) => r.json())
        .then((body) => setProbe(body as Probe))
        .catch(() => setProbe({ ollama: { seated: false } }));
    }, 400);
    return () => window.clearTimeout(t);
  }, [hats.ollamaUrl]);

  async function applyFile(file: File) {
    const text = await file.text();
    onChange(mergeHats(hats, parseHatsFile(text, file.name)));
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);
    const file = e.dataTransfer.files[0];
    if (file) void applyFile(file);
  }

  function onPick(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (file) void applyFile(file);
    e.currentTarget.value = "";
  }

  function download() {
    const blob = new Blob([exportHats(hats)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bench-hats.env";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-md border bg-surface px-4 py-4",
        hover ? "border-accent" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted">API drop box</p>
        <div className="flex gap-2">
          <Lamp on={seated.porch} label="Porch" />
          <Lamp on={seated.nvidia} label="NVIDIA" />
          <Lamp on={probe?.ollama.seated ?? seated.ollama} label="Ollama" />
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Drop a .env or hats.json. NVIDIA is Bearer on the Porch ear. Ollama is a hat. Whisper stays out.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field
          id="porch-ear"
          label="Porch ear URL"
          value={hats.porchEar}
          placeholder="Porch STT — EverettNC/PORCH, not Whole House"
          onChange={(porchEar) => onChange({ ...hats, porchEar })}
        />
        <Field
          id="nvidia-key"
          label="NVIDIA API key"
          value={hats.nvidiaKey}
          placeholder="nvapi-…"
          secret
          onChange={(nvidiaKey) => onChange({ ...hats, nvidiaKey })}
        />
        <Field
          id="ollama-url"
          label="Ollama"
          value={hats.ollamaUrl}
          placeholder="http://127.0.0.1:11434"
          onChange={(ollamaUrl) => onChange({ ...hats, ollamaUrl })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg hover:border-accent"
        >
          Drop hats
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm text-fg hover:border-accent"
        >
          Export
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".env,.json,.txt,text/plain" className="sr-only" onChange={onPick} />
    </section>
  );
}

function Field({
  id,
  label,
  value,
  placeholder,
  secret,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  secret?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-subtle">
        {label}
      </label>
      <input
        id={id}
        value={value}
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-sm border border-line bg-raised px-3 font-mono text-sm text-fg placeholder:text-subtle"
      />
    </div>
  );
}

function Lamp({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-subtle">
      <span className={cn("size-1.5 rounded-full", on ? "bg-warn" : "bg-line")} />
      {label}
    </span>
  );
}

export function takeHatsDrop(file: File | undefined) {
  if (!file) return false;
  return isHatsFilename(file.name);
}
