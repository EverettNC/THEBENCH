import { join } from "node:path";

/** Bags live here. Not /tmp. Not the live organ. */
export function evidenceRoot() {
  const fromEnv = process.env.BENCH_EVIDENCE?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), "evidence");
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
