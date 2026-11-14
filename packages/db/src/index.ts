import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Where the local database, uploads and exports live. The web app and the
 * worker both run from apps/<name>, so the default resolves to <repo>/data.
 */
export function dataDir(): string {
  return resolve(process.env.REELCRAFT_DATA_DIR ?? join(process.cwd(), "../../data"));
}

/** Folder holding one reel's source, proxy, transcript and exports. */
export function reelDir(reelId: string): string {
  return join(dataDir(), "reels", reelId);
}

export const JOB_STAGES = ["normalize", "transcribe", "plan", "render"] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export type JobState = "queued" | "running" | "succeeded" | "failed" | "canceled";
/** "auto" runs every stage from an upload; "render" re-exports an edited project. */
export type JobType = "auto" | "render";

export type Reel = {
  id: string;
  name: string;
  sourceFile: string;
  /** Project JSON once the plan stage has produced it. */
  project: unknown | null;
  createdAt: number;
  updatedAt: number;
};

export type Job = {
  id: string;
  reelId: string;
  type: JobType;
  state: JobState;
  stage: JobStage | null;
  error: string | null;
  cancelRequested: boolean;
  createdAt: number;
  updatedAt: number;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_file TEXT NOT NULL,
    project TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    reel_id TEXT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    state TEXT NOT NULL,
    stage TEXT,
    error TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_queue ON jobs (state, created_at);
  CREATE INDEX IF NOT EXISTS jobs_reel ON jobs (reel_id, created_at);
`;

type Row = Record<string, unknown>;

const toReel = (row: Row): Reel => ({
  id: row.id as string,
  name: row.name as string,
  sourceFile: row.source_file as string,
  project: row.project ? JSON.parse(row.project as string) : null,
  createdAt: row.created_at as number,
  updatedAt: row.updated_at as number,
});

const toJob = (row: Row): Job => ({
  id: row.id as string,
  reelId: row.reel_id as string,
  type: row.type as JobType,
  state: row.state as JobState,
  stage: (row.stage as JobStage | null) ?? null,
  error: (row.error as string | null) ?? null,
  cancelRequested: row.cancel_requested === 1,
  createdAt: row.created_at as number,
  updatedAt: row.updated_at as number,
});

export class Store {
  private readonly db: DatabaseSync;

  /** Pass ":memory:" for tests; the default is <dataDir>/reelcraft.sqlite. */
  constructor(path?: string) {
    if (!path) mkdirSync(dataDir(), { recursive: true });
    this.db = new DatabaseSync(path ?? join(dataDir(), "reelcraft.sqlite"));
    // WAL lets the web app read while the worker writes.
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  createReel(input: { id?: string; name: string; sourceFile: string }): Reel {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    this.db
      .prepare("INSERT INTO reels (id, name, source_file, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.name, input.sourceFile, now, now);
    return this.getReel(id)!;
  }

  getReel(id: string): Reel | null {
    const row = this.db.prepare("SELECT * FROM reels WHERE id = ?").get(id) as Row | undefined;
    return row ? toReel(row) : null;
  }

  listReels(limit = 50): Reel[] {
    const rows = this.db.prepare("SELECT * FROM reels ORDER BY created_at DESC LIMIT ?").all(limit);
    return (rows as Row[]).map(toReel);
  }

  saveProject(reelId: string, project: unknown): void {
    this.db
      .prepare("UPDATE reels SET project = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(project), Date.now(), reelId);
  }

  enqueueJob(reelId: string, type: JobType): Job {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare("INSERT INTO jobs (id, reel_id, type, state, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)")
      .run(id, reelId, type, now, now);
    return this.getJob(id)!;
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
    return row ? toJob(row) : null;
  }

  latestJob(reelId: string): Job | null {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE reel_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(reelId) as Row | undefined;
    return row ? toJob(row) : null;
  }

  /** Atomically takes the oldest queued job, or returns null when the queue is empty. */
  claimNextJob(): Job | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare("SELECT id FROM jobs WHERE state = 'queued' ORDER BY created_at, rowid LIMIT 1")
        .get() as { id: string } | undefined;
      if (row) {
        this.db
          .prepare("UPDATE jobs SET state = 'running', error = NULL, updated_at = ? WHERE id = ?")
          .run(Date.now(), row.id);
      }
      this.db.exec("COMMIT");
      return row ? this.getJob(row.id) : null;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  setStage(jobId: string, stage: JobStage): void {
    this.db.prepare("UPDATE jobs SET stage = ?, updated_at = ? WHERE id = ?").run(stage, Date.now(), jobId);
  }

  finishJob(jobId: string, state: "succeeded" | "failed" | "canceled", error?: string): void {
    this.db
      .prepare("UPDATE jobs SET state = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(state, error ?? null, Date.now(), jobId);
  }

  /** Flags a job for cancellation; a queued job is canceled immediately. */
  requestCancel(jobId: string): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE jobs SET state = 'canceled', updated_at = ? WHERE id = ? AND state = 'queued'")
      .run(now, jobId);
    this.db
      .prepare("UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND state = 'running'")
      .run(now, jobId);
  }

  isCancelRequested(jobId: string): boolean {
    return this.getJob(jobId)?.cancelRequested ?? false;
  }

  /**
   * Puts jobs a crashed worker left "running" back in the queue. Finished
   * stages keep their files on disk, so the retry resumes from the last one.
   */
  requeueInterrupted(): number {
    const result = this.db
      .prepare("UPDATE jobs SET state = 'queued', updated_at = ? WHERE state = 'running'")
      .run(Date.now());
    return Number(result.changes);
  }
}
