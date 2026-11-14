import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { reelDir } from "@reelcraft/db";
import { store, summarize } from "@/lib/server";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);

export function GET() {
  return Response.json({ reels: store().listReels().map(summarize) });
}

/**
 * Upload: the request body is the raw video file and the x-file-name header
 * carries its (URL-encoded) name. Queues automatic reel creation.
 */
export async function POST(request: Request) {
  const fileName = basename(decodeURIComponent(request.headers.get("x-file-name") ?? ""));
  const extension = extname(fileName).toLowerCase();
  if (!request.body || !EXTENSIONS.has(extension)) {
    return Response.json({ error: "Upload an MP4, MOV, WebM, MKV or M4V video." }, { status: 400 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "This file is larger than 500 MB." }, { status: 413 });
  }

  const id = randomUUID();
  const dir = reelDir(id);
  const sourceFile = `source${extension}`;
  await mkdir(dir, { recursive: true });

  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      done(received > MAX_UPLOAD_BYTES ? new Error("too large") : null, chunk);
    },
  });
  try {
    // The cast bridges the DOM and Node declarations of ReadableStream.
    const body = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(body, limit, createWriteStream(join(dir, sourceFile)));
  } catch {
    await rm(dir, { recursive: true, force: true });
    const tooLarge = received > MAX_UPLOAD_BYTES;
    return Response.json(
      { error: tooLarge ? "This file is larger than 500 MB." : "The upload was interrupted. Try again." },
      { status: tooLarge ? 413 : 400 },
    );
  }
  if (received === 0) {
    await rm(dir, { recursive: true, force: true });
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  const name = basename(fileName, extension).slice(0, 120) || "Untitled reel";
  const reel = store().createReel({ id, name, sourceFile });
  store().enqueueJob(reel.id, "auto");
  return Response.json({ id: reel.id }, { status: 201 });
}
