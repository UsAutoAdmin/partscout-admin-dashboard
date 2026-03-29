import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import type { TranscriptWord } from "./transcribe";
import { ASSETS_DIR } from "./constants";

export interface CaptionChunk {
  text: string;
  start: number;
  end: number;
}

const MONTSERRAT_PATH = path.join(ASSETS_DIR, "fonts", "Montserrat-ExtraBold.ttf");
const CAPTION_COLOR = "0x1C4629";
const BORDER_COLOR = "white";
const FONT_SIZE = 52;
const BORDER_WIDTH = 3;
const Y_POSITION = "h*0.78";

/**
 * Group transcript words into 3-word chunks and send to a cheap LLM
 * for minor cleanup (fix spelling, remove filler, ensure readability).
 */
export async function cleanCaptions(
  words: TranscriptWord[]
): Promise<CaptionChunk[]> {
  if (words.length === 0) return [];

  const rawChunks: CaptionChunk[] = [];
  for (let i = 0; i < words.length; i += 3) {
    const group = words.slice(i, i + 3);
    rawChunks.push({
      text: group.map((w) => w.word).join(" "),
      start: group[0].start,
      end: group[group.length - 1].end,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[captions] No ANTHROPIC_API_KEY — returning raw chunks without LLM cleanup");
    return rawChunks;
  }

  try {
    const client = new Anthropic({ apiKey });

    const chunksPayload = rawChunks.map((c, i) => ({
      index: i,
      text: c.text,
    }));

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Clean these video caption chunks for on-screen display. Each chunk is max 3 words shown at a time. Fix spelling errors, remove filler words (um, uh, like), capitalize properly for captions, and ensure they read naturally. Do NOT change the meaning or add words. If a chunk is just a filler word, replace it with empty string "". Return ONLY a JSON array of objects with "index" and "text" fields.\n\nChunks:\n${JSON.stringify(chunksPayload, null, 2)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return rawChunks;
    }

    const jsonStr = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const cleaned: { index: number; text: string }[] = JSON.parse(jsonStr);

    const result: CaptionChunk[] = [];
    for (const item of cleaned) {
      if (item.index < rawChunks.length && item.text.trim()) {
        result.push({
          text: item.text.trim(),
          start: rawChunks[item.index].start,
          end: rawChunks[item.index].end,
        });
      }
    }

    return result.length > 0 ? result : rawChunks;
  } catch (err: any) {
    console.log(`[captions] LLM cleanup failed: ${err.message} — using raw chunks`);
    return rawChunks;
  }
}

/**
 * Escape special characters for FFmpeg drawtext filter.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%");
}

/**
 * Build a chain of FFmpeg drawtext filters for burning captions into video.
 * Returns a filter string like: drawtext=...,drawtext=...,drawtext=...
 *
 * @param chunks - Caption chunks with text and timestamps
 * @param offsetSeconds - Time offset to subtract from chunk timestamps
 *   (e.g., segment start time to make timestamps segment-relative)
 */
export function buildCaptionDrawtext(
  chunks: CaptionChunk[],
  offsetSeconds: number = 0
): string {
  if (chunks.length === 0) return "";

  const filters = chunks.map((chunk) => {
    const start = Math.max(0, chunk.start - offsetSeconds);
    const end = Math.max(start + 0.1, chunk.end - offsetSeconds);
    const escaped = escapeDrawtext(chunk.text);

    return (
      `drawtext=fontfile='${MONTSERRAT_PATH}'` +
      `:text='${escaped}'` +
      `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'` +
      `:x=(w-text_w)/2` +
      `:y=${Y_POSITION}` +
      `:fontsize=${FONT_SIZE}` +
      `:fontcolor=${CAPTION_COLOR}` +
      `:borderw=${BORDER_WIDTH}` +
      `:bordercolor=${BORDER_COLOR}`
    );
  });

  return filters.join(",");
}

/**
 * Extract words from a transcript that fall within a segment's time range
 * and produce cleaned caption chunks for that segment.
 */
export async function captionsForSegment(
  allWords: TranscriptWord[],
  segStart: number,
  segEnd: number
): Promise<CaptionChunk[]> {
  const segWords = allWords.filter(
    (w) => w.start >= segStart - 0.05 && w.end <= segEnd + 0.05
  );
  return cleanCaptions(segWords);
}
