"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type ReelSummary, cancelJob, fileUrl, getReel, startJob } from "@/lib/api";
import { STAGES, isBusy } from "./status";

const button =
  "rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`;

function Progress({ reel }: { reel: ReelSummary }) {
  const job = reel.job;
  const stages = job?.type === "render" ? STAGES.filter((s) => s.id === "render") : STAGES;
  const current = stages.findIndex((s) => s.id === job?.stage);
  return (
    <ol className="space-y-2" aria-live="polite">
      {stages.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "active" : "waiting";
        return (
          <li key={stage.id} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={`inline-block h-3 w-3 rounded-full ${
                state === "done" ? "bg-green-600" : state === "active" ? "animate-pulse bg-blue-600" : "bg-slate-300"
              }`}
            />
            <span className={state === "waiting" ? "text-slate-500" : "font-medium text-slate-900"}>
              {stage.label}
              {state === "done" ? " — done" : state === "active" ? " — in progress" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ReelStatus({ id }: { id: string }) {
  const [reel, setReel] = useState<ReelSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = (await getReel(id)).reel;
      setReel(next);
      setError(null);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this reel.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      const next = await refresh();
      if (!stopped && next && isBusy(next)) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Restart polling whenever a new job begins.
  }, [refresh, reel?.job?.id]);

  const act = async (action: (id: string) => Promise<{ reel: ReelSummary }>) => {
    try {
      setReel((await action(id)).reel);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work. Try again.");
    }
  };

  if (!reel) {
    return <p className="p-8 text-slate-600">{error ?? "Loading…"}</p>;
  }

  const job = reel.job;
  const busy = isBusy(reel);
  const version = job?.updatedAt;
  const language = reel.languages[0];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">{reel.name}</h1>

      {busy ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {job?.state === "queued" ? "Waiting to start" : "Making your reel"}
          </h2>
          <Progress reel={reel} />
          <p className="mt-4 text-sm text-slate-600">
            The first reel downloads the speech model, which can take a few minutes. You can leave
            this page; the work continues.
          </p>
          <button type="button" className={`${secondary} mt-4`} onClick={() => act(cancelJob)}>
            Cancel
          </button>
        </section>
      ) : null}

      {!busy && job?.state === "failed" ? (
        <section role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-base font-semibold text-red-900">This reel could not be made</h2>
          <p className="mt-2 text-sm text-red-900">{job.error}</p>
          <button type="button" className={`${secondary} mt-4`} onClick={() => act(startJob)}>
            Try again
          </button>
        </section>
      ) : null}

      {!busy && job?.state === "canceled" ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-800">Canceled. Finished steps are kept, so resuming is quick.</p>
          <button type="button" className={`${secondary} mt-4`} onClick={() => act(startJob)}>
            Resume
          </button>
        </section>
      ) : null}

      {reel.hasExport && !busy ? (
        <section className="mt-6 grid gap-8 sm:grid-cols-[300px_1fr]">
          <video
            key={version}
            controls
            playsInline
            poster={fileUrl(id, "cover.jpg", version)}
            src={fileUrl(id, "reel.mp4", version)}
            className="w-full rounded-xl bg-black shadow"
          />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {job?.state === "succeeded" ? "Your reel is ready" : "Last finished export"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              1080 × 1920, 30 fps MP4 with captions burned in. Captions were written automatically;
              check them before posting.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <a className={`${button} inline-block bg-blue-600 text-white hover:bg-blue-700`} href={`${fileUrl(id, "reel.mp4")}?download=1`}>
                  Download video (MP4)
                </a>
              </li>
              <li>
                <a className="text-blue-700 underline" href={`${fileUrl(id, "cover.jpg")}?download=1`}>
                  Cover image (JPG)
                </a>
              </li>
              {language ? (
                <li>
                  Subtitle files:{" "}
                  <a className="text-blue-700 underline" href={`${fileUrl(id, `captions.${language}.srt`)}?download=1`}>
                    SRT
                  </a>
                  {" · "}
                  <a className="text-blue-700 underline" href={`${fileUrl(id, `captions.${language}.vtt`)}?download=1`}>
                    VTT
                  </a>
                </li>
              ) : null}
            </ul>
            <Link href={`/reels/${id}/edit`} className={`${secondary} mt-6 inline-block`}>
              Edit captions and text
            </Link>
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
