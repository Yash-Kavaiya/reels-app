import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Serves a fixed set of local files on localhost with Range support, so the
 * Remotion browser can read normalised media without it leaving the worker.
 */
export async function serveFiles(files: Record<string, string>) {
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? "/").slice(1).split("?")[0] ?? "");
    const path = files[name];
    if (!path) {
      res.writeHead(404).end();
      return;
    }
    const { size } = statSync(path);
    const headers = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    };
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (!match) {
      res.writeHead(200, { ...headers, "Content-Length": size });
      createReadStream(path).pipe(res);
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(path, { start, end }).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    urlFor: (name: string) => `http://127.0.0.1:${port}/${encodeURIComponent(name)}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
