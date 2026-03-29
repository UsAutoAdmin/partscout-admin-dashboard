import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptWord } from "./transcribe";

export interface HookQualityResult {
  flagged: boolean;
  reason?: string;
}

const FILLER_WORDS = new Set([
  "um", "uh", "uh-huh", "hmm", "hm", "er", "ah", "eh",
  "like", "you know", "i mean", "basically", "actually",
  "literally", "right", "so", "well",
]);

const MAX_MID_HOOK_PAUSE_S = 1.5;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const MIN_HEURISTIC_FLAGS = 2;

/**
 * Extract words that fall within a given time range.
 */
export function wordsInRange(
  words: TranscriptWord[],
  start: number,
  end: number
): TranscriptWord[] {
  return words.filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05);
}

/**
 * Heuristic analysis for detecting stumbles in a hook transcript.
 * Returns a list of triggered heuristics.
 */
function heuristicCheck(hookWords: TranscriptWord[]): string[] {
  const triggers: string[] = [];

  if (hookWords.length === 0) return triggers;

  // 1. Average word probability below threshold
  const probs = hookWords.filter((w) => w.probability != null).map((w) => w.probability!);
  if (probs.length > 0) {
    const avgProb = probs.reduce((a, b) => a + b, 0) / probs.length;
    if (avgProb < LOW_CONFIDENCE_THRESHOLD) {
      triggers.push(`Low average word confidence (${(avgProb * 100).toFixed(0)}%)`);
    }
  }

  // 2. Filler words
  const fillerHits: string[] = [];
  for (const w of hookWords) {
    if (FILLER_WORDS.has(w.word.toLowerCase().replace(/[.,!?]/g, ""))) {
      fillerHits.push(w.word);
    }
  }
  if (fillerHits.length >= 2) {
    triggers.push(`Multiple filler words: ${fillerHits.slice(0, 3).join(", ")}`);
  }

  // 3. Consecutive duplicate words (stuttering)
  for (let i = 1; i < hookWords.length; i++) {
    const prev = hookWords[i - 1].word.toLowerCase().replace(/[.,!?]/g, "");
    const curr = hookWords[i].word.toLowerCase().replace(/[.,!?]/g, "");
    if (prev === curr && prev.length > 1) {
      triggers.push(`Repeated word: "${curr}"`);
      break;
    }
  }

  // 4. Long mid-hook pauses
  for (let i = 1; i < hookWords.length; i++) {
    const gap = hookWords[i].start - hookWords[i - 1].end;
    if (gap > MAX_MID_HOOK_PAUSE_S) {
      triggers.push(`Long pause (${gap.toFixed(1)}s) mid-hook`);
      break;
    }
  }

  return triggers;
}

/**
 * Use a cheap LLM to confirm whether the hook transcript contains a stumble.
 */
async function llmConfirmStumble(hookText: string): Promise<HookQualityResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { flagged: true, reason: "Heuristic flagged (LLM unavailable)" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Analyze this short video hook transcript for speech quality issues. Does it contain a stumble, false start, repeated words, filler words (um, uh), or mid-sentence restarts that would make it unsuitable for publishing?\n\nTranscript: "${hookText}"\n\nReply with ONLY valid JSON: {"flagged": true/false, "reason": "brief explanation"}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { flagged: true, reason: "Heuristic flagged (LLM parse error)" };
    }

    const jsonStr = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonStr);
    return {
      flagged: Boolean(parsed.flagged),
      reason: parsed.reason || undefined,
    };
  } catch (err: any) {
    console.log(`[stumble-detect] LLM call failed: ${err.message}`);
    return { flagged: true, reason: "Heuristic flagged (LLM error)" };
  }
}

/**
 * Analyze the quality of a single hook.
 * Uses heuristics first; if enough flags trigger, confirms with cheap LLM.
 */
export async function analyzeHookQuality(
  words: TranscriptWord[],
  hookStart: number,
  hookEnd: number
): Promise<HookQualityResult> {
  const hookWords = wordsInRange(words, hookStart, hookEnd);

  if (hookWords.length === 0) {
    return { flagged: true, reason: "No speech detected in hook" };
  }

  const triggers = heuristicCheck(hookWords);

  if (triggers.length < MIN_HEURISTIC_FLAGS) {
    return { flagged: false };
  }

  const hookText = hookWords.map((w) => w.word).join(" ");
  return llmConfirmStumble(hookText);
}
