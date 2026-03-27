import Anthropic from "@anthropic-ai/sdk";

export interface OverlayTimestamp {
  text: string;
  start: number;
  end: number;
}

export interface OverlayDetectionResult {
  part: OverlayTimestamp | null;
  car: OverlayTimestamp | null;
  price: OverlayTimestamp | null;
  soldPrice: OverlayTimestamp | null;
}

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

const SYSTEM_PROMPT = `You are analyzing a transcript from a short-form video about flipping auto parts from junkyards. The speaker typically mentions:

1. The PART name (e.g., "radio bezel", "headlight", "tail light assembly")
2. The CAR it came from (e.g., "2005 Buick Enclave", "2018 Honda Civic")
3. The PRICE paid at the junkyard (e.g., "$5", "five dollars", "$2.50")
4. The eBay SOLD PRICE / what it sold for (e.g., "$45", "forty-five dollars", "sold for $89")

Given the transcript with word-level timestamps, identify the exact timestamps where each of these 4 items is mentioned. Return valid JSON only, no explanation.`;

const USER_PROMPT = `Here is the transcript with word-level timestamps:

{{WORDS_JSON}}

Identify the timestamps for each category. Return JSON in exactly this format:
{
  "part": {"text": "the part name mentioned", "start": <number>, "end": <number>} or null,
  "car": {"text": "the car mentioned", "start": <number>, "end": <number>} or null,
  "price": {"text": "the yard price mentioned", "start": <number>, "end": <number>} or null,
  "soldPrice": {"text": "the sold price mentioned", "start": <number>, "end": <number>} or null
}

The start/end values should correspond to the word timestamps from the transcript. If a category spans multiple words, use the start of the first word and end of the last word. If a category is not mentioned, return null for it.`;

export async function detectOverlayTimestamps(
  words: TranscriptWord[]
): Promise<OverlayDetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set in environment");
  }

  const client = new Anthropic({ apiKey });

  const wordsJson = JSON.stringify(
    words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    null,
    2
  );

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: USER_PROMPT.replace("{{WORDS_JSON}}", wordsJson),
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic");
  }

  const jsonStr = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonStr);

  return {
    part: parsed.part ?? null,
    car: parsed.car ?? null,
    price: parsed.price ?? null,
    soldPrice: parsed.soldPrice ?? null,
  };
}
