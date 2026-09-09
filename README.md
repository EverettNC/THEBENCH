# The Bench

Audio. Video. Forensics. The Christman AI Project.

Door: **4849**.

Drop a video. The bench keeps original bytes and pulls:

- **original.bin** — the tape, untouched
- **evidence.wav** — PCM 16-bit 48 kHz stereo
- **porch.wav** — PCM 16-bit 16 kHz mono
- **cuts** — ffmpeg scene score
- **silence / speech spans**
- **SHA-256 and SHA-512** (FIPS 180-4)
- **UTC process log**
- **evidence bag** (`bag.tgz` + `MANIFEST.txt`)
- **Porch transcript** — [EverettNC/PORCH](https://github.com/EverettNC/PORCH). Whole tape in 60-second windows. `TRANSCRIPT.txt`, `TRANSCRIPT.srt`, `TRANSCRIPT.vtt` in the bag. Not Whole House. Whisper is not in this body. Empty ear stays empty.

Empty ear stays empty. No invented speech.

150-minute tapes are in scope. Cap is 20 GB. Original streamed to disk. Hashes streamed.

Reports land in `/Volumes/ELEMENTS/EVIDENCE/{jobId}/`: `packet.json`, `REPORT.txt`, `DRIFT.txt`, `SCREEN.txt`, `MANIFEST.txt`, `bag.tgz`, WAVs, cuts, stills. Not `/tmp`. Not the repo. Not live audio. ELEMENTS has to be mounted. The Filament ([EverettNC/THEFILAMENT](https://github.com/EverettNC/THEFILAMENT)) hears the file ear (`:4850/stt`) after the fact. Porch is the dialect over it, not the ear. Scene cuts plus interval stills. Tesseract reads glyphs on those stills. Empty frame stays empty. Drift is A/V duration, start skew, and frame-count vs fps.

This bench produces a forensic processing record for agency submission. It is **not** an FDA-cleared medical device.

## Run

```bash
npm install
npm run dev
```

Listens on `0.0.0.0:4849`.

Seat Porch from its own repo. Drop NVIDIA / Ollama hats in the API box.
