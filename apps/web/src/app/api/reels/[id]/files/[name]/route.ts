import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { notFound, publicFilePath, store } from "@/lib/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; name: string }> };

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".srt": "application/x-subrip; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
};

/** Serves a reel's media with Range support; add ?download=1 to save it as a file. */
export async function GET(request: Request, { params }: Context) {
  const { id, name } = await params;
  const reel = store().getReel(id);
  const path = reel && publicFilePath(id, name);
  const info = path ? await stat(path).catch(() => null) : null;
  if (!reel || !path || !info) return notFound();

  const headers = new Headers({
    "Content-Type": TYPES[extname(name)] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  if (new URL(request.url).searchParams.has("download")) {
    const fileName = `${reel.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "reel"}-${name}`;
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  }

  const toBody = (stream: Readable) => Readable.toWeb(stream) as unknown as BodyInit;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range) {
    headers.set("Content-Length", String(info.size));
    return new Response(toBody(createReadStream(path)), { headers });
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
  if (start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(toBody(createReadStream(path, { start, end })), { status: 206, headers });
}
