import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type ReelCopy = { headline: string; callToAction: string };

const HEADLINE_MAX = 40;
const CTA_MAX = 30;

const CALLS_TO_ACTION: Record<string, string> = {
  en: "Follow for more",
  hi: "और के लिए फ़ॉलो करें",
  gu: "વધુ માટે ફોલો કરો",
};

/** Copy made without a language model: the opening sentence and a stock call to action. */
export function heuristicCopy(transcript: string, language: string, reelName: string): ReelCopy {
  const sentence = transcript.trim().split(/(?<=[.!?।])\s+/)[0] ?? "";
  let headline = sentence.replace(/[.!?।]+$/, "").trim();
  if (!headline) headline = reelName.replace(/[_-]+/g, " ").trim();
  if (headline.length > HEADLINE_MAX) {
    const cut = headline.slice(0, HEADLINE_MAX - 1);
    headline = `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
  }
  return { headline, callToAction: CALLS_TO_ACTION[language] ?? CALLS_TO_ACTION.en! };
}

const copySchema = z.object({ headline: z.string(), callToAction: z.string() });

const SYSTEM = `You write the on-screen text for short vertical videos (Instagram Reels, YouTube Shorts).
Given the transcript of a clip, write:
- headline: a hook shown at the top for the whole video. At most ${HEADLINE_MAX} characters. It must describe what the speaker actually says; do not promise anything the clip does not deliver.
- callToAction: a short closing prompt shown in the last seconds. At most ${CTA_MAX} characters.
Write both in the same language and script as the transcript. Keep product and brand names as spoken. No hashtags, no emoji, no quotation marks.`;

/**
 * Asks Claude for a headline and call to action. Returns null when no
 * credentials are configured or the request fails, so the caller can fall back.
 */
async function claudeCopy(transcript: string, language: string): Promise<ReelCopy | null> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(copySchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Language: ${language}\n\nTranscript:\n${transcript}` }],
    });
    const copy = response.parsed_output;
    if (response.stop_reason !== "end_turn" || !copy) {
      console.warn(`copy: Claude stopped with ${response.stop_reason}; using the transcript instead`);
      return null;
    }
    const headline = copy.headline.trim();
    const callToAction = copy.callToAction.trim();
    if (!headline || headline.length > HEADLINE_MAX || !callToAction || callToAction.length > CTA_MAX) {
      console.warn("copy: Claude's text did not fit the limits; using the transcript instead");
      return null;
    }
    return { headline, callToAction };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.warn("copy: the Anthropic credentials were rejected; using the transcript instead");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.warn("copy: Anthropic rate limit reached; using the transcript instead");
    } else if (error instanceof Anthropic.APIError) {
      console.warn(`copy: Anthropic API error ${error.status}; using the transcript instead`);
    } else {
      throw error;
    }
    return null;
  }
}

/** Headline and call to action for a reel: Claude when available, otherwise the heuristic. */
export async function planCopy(
  transcript: string,
  language: string,
  reelName: string,
): Promise<ReelCopy & { source: "claude" | "heuristic" }> {
  const fromClaude = transcript.trim() ? await claudeCopy(transcript, language) : null;
  if (fromClaude) return { ...fromClaude, source: "claude" };
  return { ...heuristicCopy(transcript, language, reelName), source: "heuristic" };
}
