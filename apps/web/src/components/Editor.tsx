"use client";

import { FPS_30, type Project, frameToUs, usToFrame } from "@reelcraft/project";
import { ReelComposition, compositionMetadata } from "@reelcraft/templates";
import { Player, type PlayerRef } from "@remotion/player";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, getReel, saveProject, startJob } from "@/lib/api";
import {
  LANGUAGES,
  acceptSegment,
  addSegment,
  removeSegment,
  setLanguage,
  setSlot,
  updateSegment,
} from "@/lib/editing";

const newId = () => crypto.randomUUID();
const toSeconds = (frame: number) => frameToUs(frame, FPS_30) / 1_000_000;
const toFrame = (seconds: number) => usToFrame(Math.max(0, Math.round(seconds * 1_000_000)), FPS_30);

const field =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";
const button =
  "rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

type SaveState = "saved" | "saving" | "failed";
const SAVE_LABEL: Record<SaveState, string> = {
  saved: "All changes saved",
  saving: "Saving…",
  failed: "Could not save; your next edit will retry",
};

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [exporting, setExporting] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const player = useRef<PlayerRef>(null);
  // The version last written to the server, so loading does not trigger a save.
  const savedVersion = useRef<Project | null>(null);

  useEffect(() => {
    getReel(id).then(
      ({ project: loaded }) => {
        if (!loaded) {
          setError("This reel is still being made. Come back when it is ready.");
          return;
        }
        savedVersion.current = loaded;
        setProject(loaded);
      },
      (cause: Error) => setError(cause.message),
    );
  }, [id]);

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!project || project === savedVersion.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveProject(id, project).then(
        () => {
          savedVersion.current = project;
          setSaveState("saved");
        },
        () => setSaveState("failed"),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [id, project]);

  const inputProps = useMemo(() => {
    if (!project) return null;
    const media = fileUrl(id, "proxy.mp4");
    return { project, assetUrls: Object.fromEntries(project.assets.map((asset) => [asset.id, media])) };
  }, [id, project]);

  if (!project || !inputProps) {
    return (
      <div className="p-8">
        <p className={error ? "text-red-800" : "text-slate-600"} role={error ? "alert" : undefined}>
          {error ?? "Loading…"}
        </p>
        {error ? (
          <Link href={`/reels/${id}`} className="mt-3 inline-block text-blue-700 underline">
            Back to the reel
          </Link>
        ) : null}
      </div>
    );
  }

  const exportAgain = async () => {
    setExporting(true);
    setError(null);
    try {
      // Make sure the server has the latest edit before it renders.
      await saveProject(id, project);
      savedVersion.current = project;
      await startJob(id);
      router.push(`/reels/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the export.");
      setExporting(false);
    }
  };

  const track = project.captionTracks[0];
  const segments = track?.segments ?? [];
  const meta = compositionMetadata(project);
  const lastEnd = segments.at(-1)?.endFrame ?? 0;
  const toReview = segments.filter((s) => s.reviewStatus === "needs-review").length;
  const language = track?.language ?? "en";

  return (
    <div className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-[360px_1fr]">
      <section aria-label="Preview">
        <div className="relative overflow-hidden rounded-xl bg-black shadow">
          <Player
            ref={player}
            component={ReelComposition}
            inputProps={inputProps}
            durationInFrames={meta.durationInFrames}
            fps={meta.fps}
            compositionWidth={meta.width}
            compositionHeight={meta.height}
            controls
            acknowledgeRemotionLicense
            style={{ width: "100%", aspectRatio: `${meta.width} / ${meta.height}` }}
          />
          {showSafeZone ? (
            // Area that Reels and Shorts cover with their own buttons and text.
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-[7%] bg-red-500/20" />
              <div className="absolute inset-x-0 bottom-0 h-[15%] bg-red-500/20" />
              <div className="absolute bottom-[15%] right-0 top-[45%] w-[14%] bg-red-500/20" />
            </div>
          ) : null}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showSafeZone}
            onChange={(event) => setShowSafeZone(event.target.checked)}
          />
          Show areas covered by the platform's buttons
        </label>
      </section>

      <section className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
            <p className="text-sm text-slate-600" aria-live="polite">
              {toSeconds(project.durationFrames).toFixed(1)} s · {SAVE_LABEL[saveState]}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/reels/${id}`} className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-100`}>
              Back
            </Link>
            <button
              type="button"
              disabled={exporting}
              onClick={exportAgain}
              className={`${button} bg-blue-600 text-white hover:bg-blue-700`}
            >
              {exporting ? "Starting…" : "Export again"}
            </button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800">
            Headline
            <input
              className={`${field} mt-1`}
              value={project.template.slots.headline ?? ""}
              maxLength={80}
              onChange={(event) => setProject(setSlot(project, "headline", event.target.value))}
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Call to action (last 3 seconds)
            <input
              className={`${field} mt-1`}
              value={project.template.slots.callToAction ?? ""}
              maxLength={40}
              onChange={(event) => setProject(setSlot(project, "callToAction", event.target.value))}
            />
          </label>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Captions</h2>
              {toReview > 0 ? (
                <p className="text-sm text-amber-800">
                  {toReview} {toReview === 1 ? "caption" : "captions"} may be wrong; the speech was unclear.
                </p>
              ) : null}
            </div>
            <label className="text-sm text-slate-700">
              Language{" "}
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                value={language}
                onChange={(event) => setProject(setLanguage(project, event.target.value))}
              >
                {LANGUAGES[language] ? null : <option value={language}>{language}</option>}
                {Object.entries(LANGUAGES).map(([code, { label }]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {segments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No speech was found in this video. Add captions by hand if you want any.
            </p>
          ) : null}

          <ol className="mt-3 space-y-2">
            {segments.map((segment, index) => {
              const uncertain = segment.reviewStatus === "needs-review";
              return (
                <li
                  key={segment.id}
                  className={`grid grid-cols-[1fr_auto] gap-2 rounded-lg border bg-white p-3 ${
                    uncertain ? "border-amber-400" : "border-slate-200"
                  }`}
                >
                  <textarea
                    aria-label={`Caption ${index + 1} text`}
                    className={`${field} h-16 resize-none`}
                    value={segment.text}
                    maxLength={200}
                    onFocus={() => player.current?.seekTo(segment.startFrame)}
                    onChange={(event) => setProject(updateSegment(project, segment.id, { text: event.target.value }))}
                  />
                  <div className="flex flex-col items-end gap-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <input
                        aria-label={`Caption ${index + 1} start, seconds`}
                        type="number"
                        step={0.1}
                        min={0}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                        value={toSeconds(segment.startFrame).toFixed(1)}
                        onChange={(event) =>
                          setProject(updateSegment(project, segment.id, { startFrame: toFrame(Number(event.target.value)) }))
                        }
                      />
                      <span>to</span>
                      <input
                        aria-label={`Caption ${index + 1} end, seconds`}
                        type="number"
                        step={0.1}
                        min={0}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                        value={toSeconds(segment.endFrame).toFixed(1)}
                        onChange={(event) =>
                          setProject(updateSegment(project, segment.id, { endFrame: toFrame(Number(event.target.value)) }))
                        }
                      />
                      <span>s</span>
                    </div>
                    <div className="flex gap-2">
                      {uncertain ? (
                        <button type="button" className="text-amber-800 underline" onClick={() => setProject(acceptSegment(project, segment.id))}>
                          Looks right
                        </button>
                      ) : null}
                      <button type="button" className="text-blue-700 underline" onClick={() => player.current?.seekTo(segment.startFrame)}>
                        Show
                      </button>
                      <button type="button" className="text-red-700 underline" onClick={() => setProject(removeSegment(project, segment.id))}>
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            disabled={lastEnd >= project.durationFrames}
            title={lastEnd >= project.durationFrames ? "Shorten the last caption to make room" : undefined}
            className={`${button} mt-3 border border-slate-300 text-slate-800 hover:bg-slate-100`}
            onClick={() => setProject(addSegment(project, newId))}
          >
            Add caption
          </button>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
