# ReelCraft Studio

A website that turns a video into a finished Reel or YouTube Short. Drop a recording and it is
cropped to 9:16, captioned from the speech, given a headline and a closing call to action, and
exported as a 1080 × 1920 MP4. Everything can be corrected in the editor and exported again.

It runs entirely on your machine: a local SQLite database, local files and local speech
recognition. No account or cloud service is needed.

## Run it

Requirements: Node 22+, pnpm, FFmpeg on the PATH, and Python with `faster-whisper`
(`pip install faster-whisper`).

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. `pnpm dev` starts both the site and the background worker.

The first reel downloads the speech model (about 460 MB for the default `small` model) and
Remotion's headless browser, so it takes a few minutes. Later reels are much quicker.

## How a reel is made

1. **Preparing the video**: the upload is converted to a constant-frame-rate H.264 proxy (first 3 minutes).
2. **Listening to the speech**: Faster Whisper transcribes it with word timestamps and detects the language.
3. **Writing captions and headline**: words are grouped into short captions; a headline and call to
   action are written by Claude when credentials are set, otherwise taken from the opening sentence.
4. **Rendering the reel**: Remotion renders the text overlays and FFmpeg composites them over the video.

Each stage leaves a file in `data/reels/<id>/`, so a canceled or interrupted job resumes from the
last finished stage. Your edits are never overwritten by a re-run.

## Settings (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Lets Claude write the headline and call to action. |
| `REELCRAFT_WHISPER_MODEL` | `small` | Speech model; `medium` or `large-v3` are more accurate and slower. |
| `REELCRAFT_PYTHON` | `python` | Python executable that has `faster-whisper` installed. |
| `REELCRAFT_DATA_DIR` | `./data` | Where the database, uploads and exports are stored. |

## Layout

```
apps/web              Next.js site: upload, progress, result, editor, API routes
apps/render-worker    Job worker: normalise, transcribe, plan, render, validate
packages/project      Project schema, time and frame maths, SRT/VTT export
packages/templates    Remotion compositions and bundled Noto fonts
packages/db           SQLite store and job queue
workers/speech        Faster Whisper transcription script
fixtures/media        Sample video with speech
```

## Commands

```sh
pnpm test         # unit tests
pnpm typecheck
pnpm --filter @reelcraft/render-worker reel <video>     # queue a video without the site
pnpm --filter @reelcraft/render-worker render:sample    # render English, Hindi and Gujarati samples
```

The original product plan is in `docs/superpowers/specs/`.
