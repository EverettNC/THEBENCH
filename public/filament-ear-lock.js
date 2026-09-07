/** One Filament owns the ear. A second page posting PCM makes Vosk wobbly. */
(function (w) {
  const KEY = "christman-filament-ear";
  const id = crypto.randomUUID();
  const ch = "BroadcastChannel" in w ? new BroadcastChannel(KEY) : null;
  let beat = 0;

  function read() {
    try {
      return JSON.parse(w.localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  }
  function alive(c) {
    return c && typeof c.t === "number" && Date.now() - c.t < 2500;
  }
  function other() {
    const c = read();
    return alive(c) && c.id !== id;
  }
  function mine() {
    const c = read();
    return alive(c) && c.id === id;
  }
  function claim() {
    if (other()) return false;
    w.localStorage.setItem(KEY, JSON.stringify({ id, t: Date.now() }));
    ch && ch.postMessage({ type: "claim", id });
    w.clearInterval(beat);
    beat = w.setInterval(() => {
      if (other()) {
        w.dispatchEvent(new Event("filament-ear-taken"));
        return;
      }
      w.localStorage.setItem(KEY, JSON.stringify({ id, t: Date.now() }));
    }, 400);
    return true;
  }
  function release() {
    w.clearInterval(beat);
    beat = 0;
    if (mine() || !other()) w.localStorage.removeItem(KEY);
    ch && ch.postMessage({ type: "release", id });
  }

  if (ch) {
    ch.onmessage = (e) => {
      const d = e.data || {};
      if (d.id === id) return;
      if (d.type === "claim") w.dispatchEvent(new Event("filament-ear-taken"));
      if (d.type === "release") w.dispatchEvent(new Event("filament-ear-free"));
    };
  }
  w.addEventListener("pagehide", release);
  w.FilamentEar = { claim, release, other };
})(window);
