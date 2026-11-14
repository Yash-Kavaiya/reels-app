import { execFile } from "node:child_process";
import { readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "../../../workers/speech/transcribe.py");

export const transcriptSchema = z.object({
  language: z.string(),
  languageProbability: z.number(),
  durationSeconds: z.number(),
  words: z.array(
    z.object({ text: z.string(), start: z.number(), end: z.number(), probability: z.number() }),
  ),
});
export type Transcript = z.infer<typeof transcriptSchema>;

export async function readTranscript(file: string): Promise<Transcript> {
  return transcriptSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

/**
 * Runs the local Faster Whisper worker and writes the transcript to `output`.
 * The first run downloads the speech model, which can take several minutes.
 */
export async function transcribe(input: string, output: string, signal?: AbortSignal): Promise<Transcript> {
  const python = process.env.REELCRAFT_PYTHON ?? "python";
  const model = process.env.REELCRAFT_WHISPER_MODEL ?? "small";
  const partial = `${output}.partial`;
  try {
    await run(python, [SCRIPT, input, partial, "--model", model], {
      maxBuffer: 16 * 1024 * 1024,
      signal,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const detail = error instanceof Error ? error.message.split("\n").slice(-4).join(" ").trim() : "";
    throw new Error(
      `Speech recognition failed. Check that Python and the faster-whisper package are installed and that the "${model}" model can be downloaded. ${detail}`,
    );
  }
  const transcript = await readTranscript(partial);
  await rename(partial, output);
  return transcript;
}
