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
- **Porch transcript** — [EverettNC/PORCH](https://github.com/EverettNC/PORCH). 60-second windows, every speech span. Not Whole House. Whisper is not in this body.

Empty ear stays empty. No invented speech.

150-minute tapes are in scope. Cap is 20 GB. Original streamed to disk. Hashes streamed.

Reports land in `evidence/{jobId}/` on this machine: `packet.json`, `REPORT.txt`, `MANIFEST.txt`, `bag.tgz`, WAVs, cuts. Not `/tmp`. Not live audio. Porch hears the file ear (`:4850/stt`) after the fact. Scene cuts are the picture.

This bench produces a forensic processing record for agency submission. It is **not** an FDA-cleared medical device.

## Run

```bash
npm install
npm run dev
```

Listens on `0.0.0.0:4849`.

Seat Porch from its own repo. Drop NVIDIA / Ollama hats in the API box.
