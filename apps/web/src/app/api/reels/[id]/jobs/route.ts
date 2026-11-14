import { isBusy, notFound, store, summarize } from "@/lib/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Starts work on a reel: a re-export when it already has a project, otherwise
 * the full automatic run (which resumes from the stages already finished).
 */
export async function POST(_request: Request, { params }: Context) {
  const reel = store().getReel((await params).id);
  if (!reel) return notFound();
  if (isBusy(store().latestJob(reel.id))) {
    return Response.json({ error: "This reel is already being processed." }, { status: 409 });
  }
  store().enqueueJob(reel.id, reel.project ? "render" : "auto");
  return Response.json({ reel: summarize(reel) }, { status: 202 });
}

/** Cancels the reel's current job. */
export async function DELETE(_request: Request, { params }: Context) {
  const reel = store().getReel((await params).id);
  if (!reel) return notFound();
  const job = store().latestJob(reel.id);
  if (job && isBusy(job)) store().requestCancel(job.id);
  return Response.json({ reel: summarize(reel) });
}
