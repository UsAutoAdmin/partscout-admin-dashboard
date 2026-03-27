import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export interface Segment {
  index: number;
  start: number;
  end: number;
  label: string;
}

/**
 * Run FFmpeg silencedetect on a video file.
 * Returns silence ranges found (periods of quiet audio).
 */
export async function detectSilence(
  filePath: string,
  noiseDb = -30,
  minDuration = 0.8
): Promise<SilenceRange[]> {
  const { stderr } = await exec("ffmpeg", [
    "-vn",
    "-i", filePath,
    "-af", `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
    "-f", "null",
    "-",
  ], { maxBuffer: 10 * 1024 * 1024 });

  const ranges: SilenceRange[] = [];
  const startRe = /silence_start:\s*([\d.]+)/g;
  const endRe = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr)) !== null) starts.push(parseFloat(m[1]));
  let idx = 0;
  while ((m = endRe.exec(stderr)) !== null) {
    ranges.push({
      start: starts[idx] ?? parseFloat(m[1]) - parseFloat(m[2]),
      end: parseFloat(m[1]),
      duration: parseFloat(m[2]),
    });
    idx++;
  }

  return ranges;
}

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath,
  ]);
  const info = JSON.parse(stdout);
  return parseFloat(info.format.duration);
}

/**
 * Given silence ranges and total video duration, derive speech segments.
 * Auto-labels: all segments before the last long pause are "Hook N",
 * the final segment is "Body".
 */
export function segmentsFromSilence(
  silenceRanges: SilenceRange[],
  totalDuration: number
): Segment[] {
  if (silenceRanges.length === 0) {
    return [{ index: 0, start: 0, end: totalDuration, label: "Body" }];
  }

  const segments: Segment[] = [];
  let cursor = 0;

  for (let i = 0; i < silenceRanges.length; i++) {
    const silence = silenceRanges[i];
    if (silence.start - cursor > 0.3) {
      segments.push({
        index: segments.length,
        start: cursor,
        end: silence.start,
        label: "",
      });
    }
    cursor = silence.end;
  }

  if (totalDuration - cursor > 0.3) {
    segments.push({
      index: segments.length,
      start: cursor,
      end: totalDuration,
      label: "",
    });
  }

  for (let i = 0; i < segments.length; i++) {
    if (i < segments.length - 1) {
      segments[i].label = `Hook ${i + 1}`;
    } else {
      segments[i].label = "Body";
    }
  }

  return segments;
}

/**
 * Structured segmentation: enforces exactly numHooks hooks + 1 body.
 * Picks the top (numHooks) longest silence gaps as the primary split points
 * between segments, absorbing shorter gaps (breaths, mid-sentence pauses).
 */
export function segmentsFromSilenceStructured(
  silenceRanges: SilenceRange[],
  totalDuration: number,
  numHooks = 3
): Segment[] {
  const totalSegments = numHooks + 1;

  if (silenceRanges.length === 0) {
    return [{ index: 0, start: 0, end: totalDuration, label: "Body" }];
  }

  if (silenceRanges.length < totalSegments - 1) {
    // Not enough gaps to form the expected structure — fall back to flexible
    return segmentsFromSilence(silenceRanges, totalDuration);
  }

  // Pick the top N-1 longest gaps (these are the deliberate pauses)
  const ranked = silenceRanges
    .map((r, i) => ({ ...r, originalIdx: i }))
    .sort((a, b) => b.duration - a.duration);

  const splitGaps = ranked
    .slice(0, totalSegments - 1)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (let i = 0; i < splitGaps.length; i++) {
    const gap = splitGaps[i];
    segments.push({
      index: i,
      start: cursor,
      end: gap.start,
      label: `Hook ${i + 1}`,
    });
    cursor = gap.end;
  }

  // Last segment is always the body
  segments.push({
    index: splitGaps.length,
    start: cursor,
    end: totalDuration,
    label: "Body",
  });

  return segments;
}

/**
 * Trim segment edges closer to actual speech onset by re-running silence
 * detection with a higher threshold at each boundary. Falls back to
 * trimming a fixed 150ms from each edge.
 */
export async function trimSegmentEdges(
  filePath: string,
  segments: Segment[],
  trimMs = 150
): Promise<Segment[]> {
  const trimmed: Segment[] = [];

  for (const seg of segments) {
    let newStart = seg.start;
    let newEnd = seg.end;

    // Body gets a longer probe window and higher threshold to cut deeper
    const isBody = seg.label === "Body";
    const startProbeWindow = isBody ? 1.0 : 0.6;
    const noiseThreshold = isBody ? "-16dB" : "-20dB";
    const fallbackTrimMs = isBody ? 300 : trimMs;

    // Trim the start: probe for the first loud sound
    try {
      const probeStart = seg.start;
      const probeLen = Math.min(startProbeWindow, (seg.end - seg.start) / 2);

      const { stderr } = await exec("ffmpeg", [
        "-vn",
        "-ss", probeStart.toFixed(3),
        "-t", probeLen.toFixed(3),
        "-i", filePath,
        "-af", `silencedetect=noise=${noiseThreshold}:d=0.05`,
        "-f", "null",
        "-",
      ], { maxBuffer: 5 * 1024 * 1024 });

      const endMatch = /silence_end:\s*([\d.]+)/.exec(stderr);
      if (endMatch) {
        const offset = parseFloat(endMatch[1]);
        newStart = probeStart + offset;
      } else {
        newStart = seg.start + fallbackTrimMs / 1000;
      }
    } catch {
      newStart = seg.start + fallbackTrimMs / 1000;
    }

    // Don't trim segment ends — the silence detection already places
    // segment boundaries at silence_start (where speech stops), so
    // trimming further would clip actual speech.

    // Safety: don't let trimming invert or shrink below 0.5s
    if (newEnd - newStart < 0.5) {
      newStart = seg.start;
      newEnd = seg.end;
    }

    trimmed.push({
      ...seg,
      start: Math.max(0, newStart),
      end: newEnd,
    });
  }

  return trimmed;
}

// Common auto part keywords and vehicle makes for body detection heuristics
const PART_KEYWORDS = [
  "headlight", "taillight", "bumper", "fender", "hood", "grille", "mirror",
  "radiator", "alternator", "starter", "compressor", "pump", "axle", "rotor",
  "caliper", "strut", "shock", "hub", "bearing", "sensor", "injector",
  "coil", "motor", "regulator", "cluster", "radio", "bezel", "rim", "wheel",
  "door", "window", "wiper", "exhaust", "catalytic", "converter", "manifold",
  "thermostat", "throttle", "fuel", "brake", "control arm", "tie rod",
  "condenser", "evaporator", "blower", "valve", "cover", "steering",
  "transmission", "engine", "turbo", "intercooler", "light", "lamp", "assembly",
];

const CAR_MAKES = [
  "acura", "alfa", "audi", "bmw", "buick", "cadillac", "chevrolet", "chevy",
  "chrysler", "dodge", "fiat", "ford", "genesis", "gmc", "honda", "hyundai",
  "infiniti", "jaguar", "jeep", "kia", "land rover", "lexus", "lincoln",
  "mazda", "mercedes", "mini", "mitsubishi", "nissan", "porsche", "ram",
  "subaru", "suzuki", "tesla", "toyota", "volkswagen", "vw", "volvo",
];

const PRICE_PATTERN = /\$\d+|\bdollar|\bbucks|\bpaid\b|\bcost\b|\bsold\b|\bselling\b|\bworth\b/i;

/**
 * Score how "body-like" a segment is using transcript words that fall within
 * its time range. The body should mention a part, a vehicle, and a price.
 * Returns 0-3 (one point per category detected).
 */
export function scoreBodyLikelihood(
  segment: Segment,
  words: { word: string; start: number; end: number }[]
): number {
  const segWords = words
    .filter((w) => w.start >= segment.start - 0.5 && w.end <= segment.end + 0.5)
    .map((w) => w.word.toLowerCase());

  const text = segWords.join(" ");

  let score = 0;

  if (PART_KEYWORDS.some((kw) => text.includes(kw))) score++;
  if (CAR_MAKES.some((make) => text.includes(make))) score++;
  if (PRICE_PATTERN.test(text)) score++;

  return score;
}

/**
 * Validate/correct body segment labeling using transcript content.
 * If the current "Body" segment doesn't look body-like but another segment
 * scores higher, swap labels. Also uses duration as a secondary signal
 * (the body is typically the longest segment).
 */
export function validateBodySegment(
  segments: Segment[],
  words: { word: string; start: number; end: number }[]
): Segment[] {
  if (segments.length < 2) return segments;

  const scores = segments.map((seg) => ({
    seg,
    score: scoreBodyLikelihood(seg, words),
    duration: seg.end - seg.start,
  }));

  const currentBody = scores.find((s) => s.seg.label === "Body");
  if (!currentBody) return segments;

  // If current body scores at least 2 out of 3, trust it
  if (currentBody.score >= 2) return segments;

  // Find the segment with the highest body score
  const best = scores.reduce((a, b) => {
    if (b.score > a.score) return b;
    // Tiebreak: prefer longer segment (body is usually longest)
    if (b.score === a.score && b.duration > a.duration) return b;
    return a;
  });

  // Only swap if the best candidate clearly beats the current body
  if (best.seg.label !== "Body" && best.score > currentBody.score) {
    console.log(
      `[body-validate] Swapping body: "${currentBody.seg.label}" (score ${currentBody.score}) → "${best.seg.label}" (score ${best.score})`
    );

    const result = segments.map((seg) => ({ ...seg }));
    const oldBodyIdx = result.findIndex((s) => s.label === "Body");
    const newBodyIdx = result.findIndex((s) => s.label === best.seg.label);

    // Swap labels
    result[oldBodyIdx].label = result[newBodyIdx].label;
    result[newBodyIdx].label = "Body";

    // Re-number hooks sequentially
    let hookNum = 1;
    for (const seg of result) {
      if (seg.label.startsWith("Hook")) {
        seg.label = `Hook ${hookNum++}`;
      }
    }

    return result;
  }

  return segments;
}

/**
 * Extract a segment from a video file using FFmpeg seek + duration.
 */
export async function extractSegment(
  inputPath: string,
  start: number,
  end: number,
  outputPath: string
): Promise<void> {
  await exec("ffmpeg", [
    "-y",
    "-ss", start.toFixed(3),
    "-i", inputPath,
    "-t", (end - start).toFixed(3),
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    outputPath,
  ]);
}
