import { existsSync, mkdirSync } from "node:fs";

/** Bags live on ELEMENTS. Not /tmp. Not the repo. Not the live organ. */
export const ELEMENTS_VOLUME = "/Volumes/ELEMENTS";
export const ELEMENTS_EVIDENCE = "/Volumes/ELEMENTS/EVIDENCE";

export function evidenceRoot() {
  const fromEnv = process.env.BENCH_EVIDENCE?.trim();
  if (fromEnv) return fromEnv;
  return ELEMENTS_EVIDENCE;
}

export function requireEvidenceRoot() {
  const root = evidenceRoot();
  if (root.startsWith(`${ELEMENTS_VOLUME}/`) || root === ELEMENTS_VOLUME) {
    if (!existsSync(ELEMENTS_VOLUME)) {
      throw new Error("ELEMENTS is not mounted. THEBENCH bags live on /Volumes/ELEMENTS/EVIDENCE.");
    }
  }
  mkdirSync(root, { recursive: true });
  return root;
}

export const FILAMENT_FILE_EAR = "http://127.0.0.1:4850/stt";
export const FILAMENT_HEALTH = "http://127.0.0.1:4850/health";

export async function forensicFileEar(explicit?: string): Promise<string> {
  const seated = (explicit || process.env.PORCH_EAR_URL || process.env.FILAMENT_EAR_URL || "").trim();
  if (seated) return seated.replace(/\/live\/?$/, "/stt");
  try {
    const res = await fetch(FILAMENT_HEALTH, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { seated?: boolean };
    if (res.ok && body.seated) return FILAMENT_FILE_EAR;
  } catch {
    /* empty ear stays empty */
  }
  return "";
}
