import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { ASSETS_DIR, VIDEO_WIDTH } from "./constants";

const MONTSERRAT_PATH = path.join(ASSETS_DIR, "fonts", "Montserrat-ExtraBold.ttf");
const BG_COLOR = "#1C4629";
const TEXT_COLOR = "#FFFFFF";
const BANNER_RADIUS = 18;
const FONT_SIZE = 72;
const PAD_X = 50;
const PAD_Y = 20;
const CHAR_WIDTH_EST = 42;

let _fontBase64Cache: string | null = null;
async function loadFontBase64(): Promise<string> {
  if (_fontBase64Cache) return _fontBase64Cache;
  const buf = await fs.readFile(MONTSERRAT_PATH);
  _fontBase64Cache = buf.toString("base64");
  return _fontBase64Cache;
}

/**
 * Generate a rounded-rectangle banner PNG with white Montserrat ExtraBold text
 * on a #1C4629 green background. The font is embedded in the SVG so librsvg
 * can render it without system font installation.
 */
export async function generateBannerImage(
  text: string,
  destPath: string
): Promise<void> {
  const fontB64 = await loadFontBase64();
  const lines = wrapText(text, 18);
  const lineHeight = FONT_SIZE + 6;
  const textBlockHeight = lines.length * lineHeight;

  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), "");
  const estimatedTextWidth = longestLine.length * CHAR_WIDTH_EST;
  const bannerWidth = Math.min(
    VIDEO_WIDTH - 40,
    Math.max(estimatedTextWidth + PAD_X * 2, 300)
  );
  const height = textBlockHeight + PAD_Y * 2;

  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="${bannerWidth / 2}" y="${
          PAD_Y + (i + 0.78) * lineHeight
        }" text-anchor="middle" font-family="MontserratBanner" font-weight="800" font-size="${FONT_SIZE}" fill="${TEXT_COLOR}">${svgEscape(line)}</text>`
    )
    .join("\n");

  const svg = `<svg width="${bannerWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style type="text/css">
        @font-face {
          font-family: 'MontserratBanner';
          src: url('data:font/truetype;base64,${fontB64}');
          font-weight: 800;
          font-style: normal;
        }
      </style>
    </defs>
    <rect x="0" y="0" width="${bannerWidth}" height="${height}" rx="${BANNER_RADIUS}" ry="${BANNER_RADIUS}" fill="${BG_COLOR}" />
    ${textSvg}
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(destPath);
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

function svgEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate unique, catchy hook text variations for each video.
 * Uses the body transcript context to create relevant hooks.
 */
export async function generateHookTexts(
  numHooks: number,
  context: {
    partName?: string;
    carName?: string;
    yardPrice?: string;
    soldPrice?: string;
  }
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return defaultHookTexts(numHooks, context);
  }

  const client = new Anthropic({ apiKey });

  const contextStr = [
    context.partName && `Part: ${context.partName}`,
    context.carName && `Car: ${context.carName}`,
    context.yardPrice && `Yard price: ${context.yardPrice}`,
    context.soldPrice && `Sold for: ${context.soldPrice}`,
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Generate ${numHooks} unique, short, catchy text hook overlays for TikTok/Reels videos about flipping junkyard auto parts for profit. Each hook should be 2-4 words max, punchy, and create curiosity.

Context: ${contextStr || "general junkyard flipping video"}

Style examples: "Junkyard Flip Revealed", "Easy Junkyard Flip", "Hidden Goldmine", "$5 to $89 Flip", "Junkyard Profit Hack"

Return ONLY a JSON array of strings, no explanation. Example: ["Hook One", "Hook Two"]`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return defaultHookTexts(numHooks, context);
    }

    const parsed = JSON.parse(
      textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "")
    );

    if (Array.isArray(parsed) && parsed.length >= numHooks) {
      return parsed.slice(0, numHooks);
    }
  } catch (err) {
    console.error("[hook-banner] Claude hook text generation failed:", err);
  }

  return defaultHookTexts(numHooks, context);
}

function defaultHookTexts(
  numHooks: number,
  context: { partName?: string; carName?: string }
): string[] {
  const defaults = [
    "Junkyard Flip Revealed",
    "Easy Junkyard Flip",
    "Hidden Goldmine",
    "Quick Parts Flip",
    "Junkyard Profit Hack",
    "Salvage Gold",
    "Flip For Profit",
    "Junkyard Score",
  ];

  if (context.partName) {
    defaults[0] = `${context.partName} Flip`;
  }

  return defaults.slice(0, numHooks);
}
