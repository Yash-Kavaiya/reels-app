// Local end-to-end check: generates a landscape test clip, normalises it, and
// renders a 10 second reel per language into ./out. Run with `pnpm render:sample`.
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { FPS_30, type Project, createProject, usToFrame } from "@reelcraft/project";
import { normalize, probe } from "./probe";
import { renderReel } from "./render";

const run = promisify(execFile);
const SECONDS = 10;

const SAMPLES: { language: string; script: string; headline: string; cta: string; lines: string[] }[] = [
  {
    language: "en",
    script: "Latn",
    headline: "3 ways to improve a Short",
    cta: "Save this for later",
    lines: ["Show the useful part first", "Keep captions short", "Give every shot a purpose"],
  },
  {
    language: "hi",
    script: "Deva",
    headline: "Shorts बेहतर बनाने के 3 तरीके",
    cta: "बाद के लिए सेव करें",
    lines: ["सबसे ज़रूरी हिस्सा पहले दिखाएं", "कैप्शन छोटे और स्पष्ट रखें", "हर दृश्य का उद्देश्य हो"],
  },
  {
    language: "gu",
    script: "Gujr",
    headline: "Shorts સુધારવાની 3 રીતો",
    cta: "પછી માટે સેવ કરો",
    lines: ["સૌથી ઉપયોગી ભાગ પહેલા બતાવો", "કૅપ્શન ટૂંકા અને સ્પષ્ટ રાખો", "દરેક દ્રશ્યનો હેતુ હોવો જોઈએ"],
  },
];

function sampleProject(sample: (typeof SAMPLES)[number], durationUs: number, size: { width: number; height: number }): Project {
  const durationFrames = usToFrame(durationUs, FPS_30);
  const project = createProject({ id: `sample-${sample.language}`, name: "Sample reel", durationFrames });
  project.languages = [sample.language];
  project.template.slots = { headline: sample.headline, callToAction: sample.cta };
  project.assets.push({
    id: "clip",
    kind: "video",
    fileName: "source.mp4",
    storageKey: null,
    proxyKey: null,
    durationUs,
    ...size,
    rotation: 0,
    provenance: "user-upload",
  });
  project.clips.push({
    id: "clip-1",
    assetId: "clip",
    sourceStartUs: 0,
    sourceEndUs: durationUs,
    outputStartFrame: 0,
    outputEndFrame: durationFrames,
    fit: "blur-fit",
    gain: 1,
    z: 0,
  });
  const per = Math.floor(durationFrames / sample.lines.length);
  project.captionTracks.push({
    id: "captions",
    language: sample.language,
    script: sample.script,
    segments: sample.lines.map((text, i) => ({
      id: `seg-${i + 1}`,
      text,
      startFrame: i * per,
      endFrame: (i + 1) * per,
      reviewStatus: "accepted" as const,
    })),
  });
  return project;
}

const out = resolve("out");
await mkdir(out, { recursive: true });

const raw = join(out, "source-raw.mp4");
await run("ffmpeg", [
  "-y",
  "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=24:duration=${SECONDS}`,
  "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=44100:duration=${SECONDS}`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
  raw,
]);

const proxy = join(out, "source-proxy.mp4");
await normalize(raw, proxy, FPS_30);
const source = await probe(proxy);
if (!source.video) throw new Error("Normalised clip has no video stream");
console.log("proxy:", source);

for (const sample of SAMPLES) {
  const project = sampleProject(sample, Math.floor(source.durationSeconds * 1_000_000), {
    width: source.video.width,
    height: source.video.height,
  });
  const started = Date.now();
  const result = await renderReel({
    project,
    assetFiles: { clip: proxy },
    outDir: join(out, sample.language),
  });
  const took = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${sample.language}: ${result.video} (${result.mode}) in ${took} s`);
  console.log("  ", await probe(result.video));
}
