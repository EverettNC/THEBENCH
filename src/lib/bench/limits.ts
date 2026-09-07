/** 150-minute 1080p phone tapes land under this. ProRes does not. */
export const MAX_TAPE_MINUTES = 150;
export const MAX_TAPE_BYTES = 20 * 1024 * 1024 * 1024;
export const TAPE_TOO_LARGE = "Tape is over 20 GB. Cut it first.";
export const MAX_EAR_WINDOW_SEC = 60;
export const FFMPEG_TIMEOUT_FLOOR_MS = 300_000;
export const FFMPEG_TIMEOUT_CAP_MS = 14_400_000;

export function ffmpegTimeoutMs(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return FFMPEG_TIMEOUT_FLOOR_MS;
  return Math.min(
    FFMPEG_TIMEOUT_CAP_MS,
    Math.max(FFMPEG_TIMEOUT_FLOOR_MS, Math.ceil(durationSec * 1500)),
  );
}
