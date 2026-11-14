import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "./index";

let store: Store;
beforeEach(() => {
  store = new Store(":memory:");
});

const newReel = () => store.createReel({ name: "Talk", sourceFile: "source.mp4" });

describe("reels", () => {
  it("creates, reads and lists reels", () => {
    const reel = newReel();
    expect(store.getReel(reel.id)).toMatchObject({ name: "Talk", sourceFile: "source.mp4", project: null });
    expect(store.listReels().map((r) => r.id)).toEqual([reel.id]);
    expect(store.getReel("missing")).toBeNull();
  });

  it("stores the project as JSON", () => {
    const reel = newReel();
    store.saveProject(reel.id, { name: "नमस्ते", clips: [1, 2] });
    expect(store.getReel(reel.id)!.project).toEqual({ name: "नमस्ते", clips: [1, 2] });
  });
});

describe("job queue", () => {
  it("claims queued jobs oldest first, each only once", () => {
    const first = store.enqueueJob(newReel().id, "auto");
    const second = store.enqueueJob(newReel().id, "auto");
    expect(store.claimNextJob()).toMatchObject({ id: first.id, state: "running" });
    expect(store.claimNextJob()).toMatchObject({ id: second.id, state: "running" });
    expect(store.claimNextJob()).toBeNull();
  });

  it("records stage, success and failure", () => {
    const job = store.enqueueJob(newReel().id, "auto");
    store.claimNextJob();
    store.setStage(job.id, "transcribe");
    expect(store.getJob(job.id)).toMatchObject({ stage: "transcribe", state: "running" });
    store.finishJob(job.id, "failed", "No speech model");
    expect(store.getJob(job.id)).toMatchObject({ state: "failed", error: "No speech model" });
  });

  it("returns the newest job for a reel", () => {
    const reel = newReel();
    store.enqueueJob(reel.id, "auto");
    const render = store.enqueueJob(reel.id, "render");
    expect(store.latestJob(reel.id)!.id).toBe(render.id);
  });

  it("cancels a queued job at once and flags a running one", () => {
    const queued = store.enqueueJob(newReel().id, "auto");
    store.requestCancel(queued.id);
    expect(store.getJob(queued.id)!.state).toBe("canceled");
    expect(store.claimNextJob()).toBeNull();

    const running = store.enqueueJob(newReel().id, "auto");
    store.claimNextJob();
    expect(store.isCancelRequested(running.id)).toBe(false);
    store.requestCancel(running.id);
    expect(store.getJob(running.id)).toMatchObject({ state: "running", cancelRequested: true });
  });

  it("requeues jobs a crashed worker left running, keeping their stage", () => {
    const job = store.enqueueJob(newReel().id, "auto");
    store.claimNextJob();
    store.setStage(job.id, "plan");
    expect(store.requeueInterrupted()).toBe(1);
    expect(store.claimNextJob()).toMatchObject({ id: job.id, stage: "plan", state: "running" });
  });
});
