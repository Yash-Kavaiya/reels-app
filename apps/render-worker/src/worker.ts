// Background worker: takes queued jobs from the local database and runs them
// one at a time. Start with `pnpm dev` at the repo root (or `pnpm worker` here).
import { setTimeout as sleep } from "node:timers/promises";
import { type Job, Store, dataDir } from "@reelcraft/db";
import { runJob } from "./pipeline";

const POLL_MS = 1000;

const store = new Store();
const requeued = store.requeueInterrupted();
console.log(`worker: using ${dataDir()}${requeued ? `, resuming ${requeued} interrupted job(s)` : ""}`);

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});

async function handle(job: Job): Promise<void> {
  console.log(`job ${job.id} (${job.type}) for reel ${job.reelId}`);
  const controller = new AbortController();
  // Cancellation is requested through the database by the web app.
  const watcher = setInterval(() => {
    if (store.isCancelRequested(job.id)) controller.abort();
  }, POLL_MS);
  try {
    await runJob(store, job, controller.signal);
    store.finishJob(job.id, "succeeded");
    console.log(`job ${job.id} succeeded`);
  } catch (error) {
    if (controller.signal.aborted) {
      store.finishJob(job.id, "canceled");
      console.log(`job ${job.id} canceled`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      store.finishJob(job.id, "failed", message.slice(0, 2000));
      console.error(`job ${job.id} failed: ${message}`);
    }
  } finally {
    clearInterval(watcher);
  }
}

while (!stopping) {
  const job = store.claimNextJob();
  if (job) await handle(job);
  else await sleep(POLL_MS);
}
store.close();
