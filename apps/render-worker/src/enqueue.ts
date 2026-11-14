// Queues a local video for automatic reel creation without the web app:
//   pnpm reel <path-to-video>
import { copyFile, mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { Store, reelDir } from "@reelcraft/db";

const input = process.argv[2];
if (!input) {
  console.error("Usage: pnpm reel <path-to-video>");
  process.exit(1);
}

const store = new Store();
const sourceFile = `source${extname(input).toLowerCase() || ".mp4"}`;
const reel = store.createReel({ name: basename(input, extname(input)), sourceFile });
await mkdir(reelDir(reel.id), { recursive: true });
await copyFile(resolve(input), join(reelDir(reel.id), sourceFile));
const job = store.enqueueJob(reel.id, "auto");
console.log(`Queued job ${job.id} for reel ${reel.id}`);
store.close();
