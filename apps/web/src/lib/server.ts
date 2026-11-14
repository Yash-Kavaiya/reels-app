import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Job, type Reel, Store, reelDir } from "@reelcraft/db";

// One connection per server process; kept on globalThis so dev reloads reuse it.
const holder = globalThis as { reelcraftStore?: Store };

export function store(): Store {
  holder.reelcraftStore ??= new Store();
  return holder.reelcraftStore;
}

/** Files of a reel that the browser may fetch, by public name. */
export function publicFilePath(reelId: string, name: string): string | null {
  if (name === "proxy.mp4") return join(reelDir(reelId), "proxy.mp4");
  if (name === "reel.mp4" || name === "cover.jpg" || /^captions\.[a-z]{2,8}\.(srt|vtt)$/.test(name)) {
    return join(reelDir(reelId), "export", name);
  }
  return null;
}

export type ReelSummary = {
  id: string;
  name: string;
  createdAt: number;
  hasProject: boolean;
  /** True once a finished export is on disk. */
  hasExport: boolean;
  languages: string[];
  job: Pick<Job, "id" | "type" | "state" | "stage" | "error" | "updatedAt"> | null;
};

export function summarize(reel: Reel): ReelSummary {
  const job = store().latestJob(reel.id);
  const project = reel.project as { languages?: string[] } | null;
  return {
    id: reel.id,
    name: reel.name,
    createdAt: reel.createdAt,
    hasProject: reel.project !== null,
    hasExport: existsSync(join(reelDir(reel.id), "export", "reel.mp4")),
    languages: project?.languages ?? [],
    job: job && {
      id: job.id,
      type: job.type,
      state: job.state,
      stage: job.stage,
      error: job.error,
      updatedAt: job.updatedAt,
    },
  };
}

export const isBusy = (job: Job | null) => job?.state === "queued" || job?.state === "running";

export function notFound(): Response {
  return Response.json({ error: "This reel does not exist." }, { status: 404 });
}
