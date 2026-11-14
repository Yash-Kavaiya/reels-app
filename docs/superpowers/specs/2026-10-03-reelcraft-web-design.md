# ReelCraft Studio — website plan (adapted from the Windows app blueprint)

## Context

`Windows_Reels_App_Full_Plan.pdf` describes ReelCraft Studio as a Windows 11 Electron app that turns footage, a script, photos or a template into a finished vertical MP4 with editable multilingual captions (English, Hindi, Gujarati). You want the same product as a **website, not a desktop app**. The working directory `C:\Users\yashk\Downloads\reels-app` is empty, so this is a new project.

Decisions you made:

| Decision | Choice |
|---|---|
| Processing | Hybrid: editing and preview in the browser; final render and transcription on cloud workers |
| First build | Vertical slice first; full roadmap after it |
| Hosting | Vercel plus managed services |
| Accounts | Guest can edit immediately; sign-in required to save to the cloud or export |

The product goals from the PDF are unchanged: every accepted job produces a real, playable MP4 plus an editable project and sidecar files; a script or storyboard alone is never "done".

## What changes from the PDF

| PDF (desktop) | Website |
|---|---|
| Electron shell, preload IPC bridge | Next.js app on Vercel; typed HTTP API validated with zod |
| Local FFmpeg + Remotion renderer | Remotion Player in the browser for preview; `@remotion/renderer` + FFmpeg in a Docker render worker for export |
| Packaged Python + Faster Whisper | Same Faster Whisper code as a containerised speech worker (milestone 3) |
| SQLite + project folder on disk | Postgres (metadata, jobs) + S3-compatible object storage (media, exports) |
| Durable local job queue | Postgres job table with stage checkpoints and input hashes; workers claim with `FOR UPDATE SKIP LOCKED` |
| Local files, relinking, portable copies (F05) | Direct-to-storage multipart uploads; guests keep media in the browser (OPFS) |
| Proxy previews (F04) | Worker creates an H.264 constant-frame-rate proxy on upload; browser previews the proxy |
| Signed installer, auto-update, clean-machine test | Dropped. Replaced by Vercel deploys, preview environments and browser support checks |
| Settings: local models, cache | Settings: account, connected accounts, usage and credits, optional bring-your-own keys (stored server-side, encrypted) |
| "Works offline, no account" | Guest editing works without an account; export and cloud save need sign-in |

New risks the website introduces, and how the plan handles them:

- **Server cost per export.** Per-user export quota, upload size and duration caps, cost shown before paid online steps.
- **Large uploads.** Resumable multipart uploads straight to object storage, never through Vercel functions.
- **Browser cannot decode some phone video (HEVC, variable frame rate, rotation).** The worker normalises on upload; a guest whose browser cannot play a file gets a clear message that signing in converts it.
- **Preview and export disagree.** One shared Remotion composition package, bundled fonts, and a reference-frame comparison test.
- **Remotion licence.** Free only for individuals and companies of up to three people; confirm terms for server rendering before launch (PDF source S9).

## Architecture

```
Browser (Next.js, React, TypeScript)
  editor UI · Remotion Player preview · guest project in IndexedDB + OPFS
        │  typed HTTP API (zod)            │ presigned multipart upload
        ▼                                  ▼
Vercel: Next.js route handlers ──── Object storage (Cloudflare R2)
        │                                  ▲
        ▼                                  │
Postgres (Neon): users, projects, assets, jobs
        ▲
        │ claim job, write checkpoints
Render worker (Docker: Node, @remotion/renderer, FFmpeg/ffprobe)
Speech worker (Docker: Python, Faster Whisper) — milestone 3
Provider gateway (route handlers): translation, TTS, script — V1
```

Stack choices:

- **Web:** Next.js App Router, React, TypeScript, Tailwind, deployed on Vercel.
- **Auth:** Auth.js with Google and email magic link; sessions in Postgres.
- **Database:** Neon Postgres with Drizzle ORM.
- **Storage:** Cloudflare R2 (S3-compatible, no egress fees for video downloads).
- **Workers:** Docker containers on a container host (Fly.io or Railway). Vercel functions are not used for encoding.
- **Composition:** Remotion; the same compositions drive the Player and the renderer.
- **Fonts:** Noto Sans, Noto Sans Devanagari, Noto Sans Gujarati bundled in the templates package and loaded identically in preview and render.
- **Tooling:** pnpm workspaces, Turborepo, Vitest, Playwright.

## Source layout

```
apps/web              Next.js site: landing, editor, API route handlers
apps/render-worker    Job poller, proxy/normalise, Remotion render, ffprobe validation
packages/project      zod project schema, migrations, time and frame maths
packages/templates    Remotion compositions, slot definitions, bundled fonts
packages/editor       Editor state, command-based undo/redo (grows in milestone 2)
packages/db           Drizzle schema, job-queue helpers
workers/speech        Python Faster Whisper worker (milestone 3)
fixtures              Sample media, caption sets, expected outputs
docs/superpowers/specs  Design spec (this plan, saved into the repo)
```

## Data contracts (from PDF page 11, kept)

- **Project:** id, schemaVersion, name, canvas (1080x1920), rational frame rate, timeline version, languages.
- **Asset:** id, storage key, hash, codec, duration, dimensions, rotation, provenance, proxy key.
- **Clip and track:** ids, source range, output range, crop, effects, gain, z-order.
- **Caption track:** language, script, linked segments, text, timing, style, review status.
- **Template and brand:** versioned template id, slot values, style tokens, locked overrides.
- **Job:** type, dependencies, input hash, state (queued, running, succeeded, failed, canceled), stage checkpoint, output key, error.

Rules: source time in integer microseconds; output timeline in integer frames; ranges start-inclusive, end-exclusive; one rounding rule in `packages/project`. The server re-validates every project with zod. Templates are referenced by id only; no user-supplied code is executed. AI planner output is structured data that is validated before use.

## Milestone 1 — vertical slice (the detailed build)

Goal: a visitor opens the site, adds one clip, applies the Clean Education template with caption segments they type or paste, previews it, signs in, and downloads a real 1080x1920, 30 fps H.264/AAC MP4.

1. **Repo setup.** `git init`, pnpm workspace, Turborepo, TypeScript, lint, Vitest. Save this plan as the spec under `docs/superpowers/specs/`.
2. **`packages/project`.** zod schema for Project, Asset, Clip, CaptionTrack, TemplateRef; time/frame conversion helpers; schema version 1. Unit tests first for rounding, range mapping and validation failures.
3. **`packages/templates`.** One Remotion composition, `CleanEducation`, with slots: presenter clip, headline, captions, call to action. Blur-background fit for non-vertical clips. Bundled Noto fonts. Font and media loading gated with `delayRender`.
4. **`apps/web` editor (guest).** Home screen with "Video to reel"; drag-and-drop one clip; Remotion Player preview with safe-zone overlay; panel to edit headline, call to action and caption segments (text, start, end); click a segment to seek. Project autosaves to IndexedDB, media to OPFS, so a reload recovers the draft.
5. **Auth and cloud save.** Auth.js sign-in. On sign-in the guest draft is uploaded: presigned multipart upload of the clip to R2, project row and asset row in Postgres.
6. **`packages/db` and the job queue.** Tables: users, projects, assets, jobs. Job helpers: enqueue, claim, checkpoint, fail, cancel. Tests against a local Postgres.
7. **`apps/render-worker`.** Docker image with Node, Chromium for Remotion, FFmpeg. Stages, each checkpointed: verify upload → ffprobe and normalise to a CFR H.264 proxy → Remotion render → ffprobe validation of the output (dimensions, fps, streams, duration, decode errors) → upload MP4, cover.jpg and captions.srt/.vtt (UTF-8). Cancellation checked between stages; bounded retries for transient errors.
8. **Export centre.** API routes: create export, get job status, cancel, download link. UI shows stage progress as text alongside the bar, actionable errors, and a download for the reel package.
9. **Limits.** Upload cap (500 MB, 3 minutes) and a per-user daily export quota, enforced on the server.
10. **Deploy.** Vercel project for `apps/web`, Neon database, R2 bucket, one worker instance. Environment variables only in the host dashboards; nothing secret in the client or in exported projects.

Completion gate: on the deployed site, a fresh account produces a complete 30-second reel from a phone clip, and a Hindi and a Gujarati caption set render without clipped glyphs.

## Roadmap after the slice

| Stage | Deliverable | Gate |
|---|---|---|
| M2 Editor | Media bin with thumbnails and waveforms, trim, split, arrange, ripple delete, crop and reframe, audio volume and fades, command-based undo/redo, autosave (F01–F09, F21–F22) | Edited projects reopen and render consistently |
| M3 Captions | Speech worker with Faster Whisper, word and sentence timing editor, script-aware fonts, SRT/VTT export (F11–F12, F15) | English, Hindi and Gujarati sample sets pass review |
| M4 Language and brand | Translated caption tracks via a provider adapter, bilingual captions, brand kits, ten templates, saved presets, music with ducking (F13–F14, F16–F19, F23) | Language and brand changes export correctly |
| M5 MVP release | Full export package, 9:16, 1:1 and 16:9, job recovery, pre-export checks, performance work, creator pilot (F26–F29) | MVP release checklist passes |
| M6 V1 creation | Script to storyboard, narration (TTS or in-browser recording), photo reels, long-video candidate clips (F31–F39) | A complete scripted reel and coherent source clips render |
| M7 V1 scale | CSV batches, language variants, noise reduction, cost dashboard, pricing tiers and billing (F24, F30, F41, F56–F57) | Failures recover without duplicate charges or exports |
| V2 | Dubbing, consented voice cloning, generative scenes, YouTube and Instagram publishing with server-side scheduling, review links, shared workspaces | Estimated separately; depends on platform API approval |

A website makes several V2 items easier than on desktop: server-side scheduling works while the user's PC is off, review links are just URLs, and screen or camera recording uses browser capture APIs.

## Verification

- **Unit (Vitest):** schema validation, time and frame maths, job state transitions, caption SRT/VTT serialisation.
- **End to end (Playwright):** guest adds a fixture clip, edits a caption, reloads and recovers the draft, signs in, exports, downloads.
- **Output check:** ffprobe on the downloaded file asserts 1080x1920, 30 fps, H.264 video, AAC audio, expected duration, no decode errors.
- **Preview and export agreement:** render reference frames from the Player and from the worker and compare them.
- **Language fixtures:** Devanagari and Gujarati conjuncts, vowel marks, mixed Latin words and numbers; no clipped or out-of-frame text.
- **Media fixtures:** variable-frame-rate phone video, rotated video, HEVC, non-ASCII file names, silent clip.
- **Failure cases:** canceled render, interrupted upload, worker restart mid-job resumes from the last checkpoint, quota exceeded.
- **Release targets (to measure, not promises):** 98 percent of a 100-job fixture set succeeds; audio and caption sync within 150 ms; a simple 60-second export finishes within 3 minutes on the chosen worker size.

## Open items to confirm during the build

- Remotion licence terms for hosted server rendering.
- FFmpeg build and licence obligations for the worker image.
- Worker host (Fly.io or Railway) once render time and memory are measured in milestone 1.
