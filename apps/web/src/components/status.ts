import type { ReelSummary } from "@/lib/api";

export const STAGES = [
  { id: "normalize", label: "Preparing the video" },
  { id: "transcribe", label: "Listening to the speech" },
  { id: "plan", label: "Writing captions and headline" },
  { id: "render", label: "Rendering the reel" },
] as const;

export const isBusy = (reel: ReelSummary) => reel.job?.state === "queued" || reel.job?.state === "running";

/** One-line status for lists. */
export function statusLabel(reel: ReelSummary): string {
  const job = reel.job;
  if (!job) return "Not started";
  if (job.state === "queued") return "Waiting to start";
  if (job.state === "running") return STAGES.find((s) => s.id === job.stage)?.label ?? "Starting";
  if (job.state === "failed") return "Failed";
  if (job.state === "canceled") return "Canceled";
  return "Ready";
}
