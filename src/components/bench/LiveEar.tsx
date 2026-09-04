import { useCallback, useEffect, useRef, useState } from "react";
import { reconstructDialect } from "@/lib/porch/dialect";
import { cn } from "@/lib/utils";

const DEFAULT_EAR = "http://127.0.0.1:4850";
const MIC_FAIL =
  "This preview cannot hold a microphone. Open The Bench in its own window, on the Mac where Filament is seated.";

function doors(raw: string) {
  const trimmed = (raw || "").trim() || DEFAULT_EAR;
  const base = trimmed.replace(/\/stt\/?$/, "").replace(/\/live\/?$/, "").replace(/\/health\/?$/, "");
  return { base, health: `${base}/health`, live: `${base}/live` };
}

function downsample(input: Float32Array, inRate: number): Int16Array {
  const outRate = 16000;
  if (inRate === outRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i] ?? 0));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inRate / outRate;
  const n = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

type Health = { seated: boolean; live?: boolean; error?: string | null; engine?: string };

export function LiveEar({ earUrl }: { earUrl: string }) {
  const { health, live } = doors(earUrl);
  const [status, setStatus] = useState<Health | null>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const listeningRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    let gone = false;
    void fetch(health)
      .then((r) => r.json())
      .then((body: Health) => {
        if (!gone) setStatus(body);
      })
      .catch(() => {
        if (!gone) setStatus({ seated: false, error: "Filament ear is not on this machine." });
      });
    return () => {
      gone = true;
    };
  }, [health]);

  const postPcm = useCallback(
    (pcm: Int16Array, query = "") => {
      queueRef.current = queueRef.current.then(async () => {
        if (!listeningRef.current && !query.includes("end")) return;
        try {
          const res = await fetch(`${live}${query}`, {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: pcm.buffer as ArrayBuffer,
          });
          const body = (await res.json()) as { ok?: boolean; final?: boolean; text?: string; partial?: string; error?: string };
          if (!body.ok) {
            setError(body.error || "The ear did not answer.");
            return;
          }
          if (body.final && body.text?.trim()) {
            const said = reconstructDialect(body.text).asSaid;
            setLines((prev) => (prev.at(-1) === said ? prev : [...prev, said]));
            setPartial("");
          } else {
            setPartial(body.partial ? reconstructDialect(body.partial).asSaid : "");
          }
        } catch {
          setError("Filament live nerve could not be reached. Is :4850 still seated?");
        }
      });
      return queueRef.current;
    },
    [live],
  );

  const stop = useCallback(async () => {
    listeningRef.current = false;
    setListening(false);
    procRef.current?.disconnect();
    procRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    await postPcm(new Int16Array(0), "?end=1");
  }, [postPcm]);

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(MIC_FAIL);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      streamRef.current = stream;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      let carry = new Int16Array(0);
      proc.onaudioprocess = (ev) => {
        if (!listeningRef.current) return;
        const input = ev.inputBuffer.getChannelData(0);
        const next = downsample(input, ctx.sampleRate);
        const merged = new Int16Array(carry.length + next.length);
        merged.set(carry);
        merged.set(next, carry.length);
        const hop = 3200;
        let offset = 0;
        while (merged.length - offset >= hop) {
          void postPcm(merged.slice(offset, offset + hop));
          offset += hop;
        }
        carry = merged.slice(offset);
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);
      listeningRef.current = true;
      setListening(true);
      await postPcm(new Int16Array(0), "?reset=1");
    } catch {
      await stop();
      setError(MIC_FAIL);
    }
  }, [postPcm, stop]);

  const seated = Boolean(status?.seated);

  return (
    <section className="rounded-lg border border-line bg-surface px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-accent">Live ear</p>
        <p className={cn("font-mono text-[0.65rem] uppercase tracking-[0.16em]", seated ? "text-accent" : "text-muted")}>
          {seated ? "Filament seated · Vosk" : "unseated"}
        </p>
      </div>
      <p className="mt-2 font-display text-2xl italic text-fg">Real time. As said.</p>
      <p className="mt-1 max-w-md text-sm text-muted">
        The cochlea is <a className="text-accent underline" href="http://127.0.0.1:4850">http://127.0.0.1:4850</a>
        — housing v2, copper / Tiffany / adodescent. This desk is the bag. 4850 is the face.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (listening ? void stop() : void start())}
          disabled={!seated && !listening}
          className="inline-flex min-h-11 items-center rounded-sm bg-accent px-5 text-sm font-medium text-bg duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          {listening ? "Stop" : "Listen"}
        </button>
        {listening ? <span className="font-mono text-xs text-accent">hearing</span> : null}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 min-h-20 rounded-sm border border-line/80 bg-bg/40 px-4 py-3">
        {lines.length === 0 && !partial ? (
          <p className="font-display text-lg italic text-muted">Nothing on the wire yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`} className="text-sm text-fg">
                {line}
              </li>
            ))}
            {partial ? <li className="font-display italic text-muted">{partial}</li> : null}
          </ul>
        )}
      </div>
    </section>
  );
}
