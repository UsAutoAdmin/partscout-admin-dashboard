import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import {
  VIDEO_WIDTH,
  HALF_HEIGHT,
  CLICK_SFX_PATH,
  LUT_PATH,
  COLOR_GRADE_FILTER,
} from "./constants";

const exec = promisify(execFile);

export interface OverlayEntry {
  slot: "part" | "car" | "price" | "soldPrice";
  imagePath: string;
  /** Timestamp (in seconds, relative to body segment start) when the overlay appears */
  timestamp: number;
}

async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath,
  ]);
  const info = JSON.parse(stdout);
  return parseFloat(info.format.duration);
}

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "quiet",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-print_format", "json",
      filePath,
    ]);
    const info = JSON.parse(stdout);
    return (info.streams?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Compose the body section: talking head on bottom half, overlaid images on top half.
 * Overlays tile seamlessly from the first detected timestamp to end of body.
 * Click SFX plays at each overlay transition.
 */
export async function composeBody(
  bodyVideoPath: string,
  overlays: OverlayEntry[],
  outputPath: string
): Promise<void> {
  const [bodyHasAudio, bodyDuration] = await Promise.all([
    hasAudioStream(bodyVideoPath),
    getVideoDuration(bodyVideoPath),
  ]);
  const useClick = await fs.access(CLICK_SFX_PATH).then(() => true).catch(() => false);
  const useLut = await fs.access(LUT_PATH).then(() => true).catch(() => false);

  const lutFilter = useLut ? `,lut3d='${LUT_PATH}'` : "";

  const sortedOverlays = [...overlays].sort((a, b) => a.timestamp - b.timestamp);

  const inputs: string[] = ["-i", bodyVideoPath];
  for (const o of sortedOverlays) {
    inputs.push("-i", o.imagePath);
  }
  const clickIdx = useClick ? 1 + sortedOverlays.length : -1;
  if (useClick) {
    inputs.push("-i", CLICK_SFX_PATH);
  }

  const filterParts: string[] = [];

  const gradeFilter = `,${COLOR_GRADE_FILTER}`;
  filterParts.push(
    `[0:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${VIDEO_WIDTH}:${HALF_HEIGHT},setsar=1${lutFilter}${gradeFilter},` +
    `scale=${VIDEO_WIDTH}:${HALF_HEIGHT},format=yuv420p[body_bottom]`
  );

  // Duration-limited black canvas so the filter graph terminates with the body
  filterParts.push(
    `color=black:s=${VIDEO_WIDTH}x${HALF_HEIGHT}:r=30:d=${bodyDuration.toFixed(3)},format=yuv420p[top_base]`
  );

  // Tile overlays seamlessly: first overlay starts at its detected timestamp,
  // each subsequent one starts right where the previous one ends. The last
  // overlay extends to the end of the body so there's never a gap.
  const overlayTimings: { start: number; end: number }[] = [];
  if (sortedOverlays.length > 0) {
    const firstStart = sortedOverlays[0].timestamp;
    const totalSpan = bodyDuration - firstStart;
    const perOverlay = totalSpan / sortedOverlays.length;

    for (let i = 0; i < sortedOverlays.length; i++) {
      const start = firstStart + i * perOverlay;
      const end = i === sortedOverlays.length - 1
        ? bodyDuration
        : firstStart + (i + 1) * perOverlay;
      overlayTimings.push({ start, end });
    }
  }

  let currentTop = "top_base";
  for (let i = 0; i < sortedOverlays.length; i++) {
    const imgInputIdx = 1 + i;
    const { start: startT, end: endT } = overlayTimings[i];

    filterParts.push(
      `[${imgInputIdx}:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${VIDEO_WIDTH}:${HALF_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[ovl_${i}]`
    );

    const nextTop = `top_${i}`;
    filterParts.push(
      `[${currentTop}][ovl_${i}]overlay=0:0:enable='between(t,${startT.toFixed(3)},${endT.toFixed(3)})'[${nextTop}]`
    );
    currentTop = nextTop;
  }

  filterParts.push(
    `[${currentTop}][body_bottom]vstack=inputs=2[vout]`
  );

  if (bodyHasAudio) {
    filterParts.push(
      `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[body_a]`
    );

    if (useClick && overlayTimings.length > 0) {
      const clickMixes: string[] = [];
      for (let i = 0; i < overlayTimings.length; i++) {
        const delayMs = Math.round(overlayTimings[i].start * 1000);
        filterParts.push(
          `[${clickIdx}:a]silenceremove=start_periods=1:start_silence=0:start_threshold=-40dB,` +
          `adelay=${delayMs}|${delayMs},aresample=44100,` +
          `aformat=sample_fmts=fltp:channel_layouts=stereo[click_${i}]`
        );
        clickMixes.push(`[click_${i}]`);
      }
      filterParts.push(
        `[body_a]${clickMixes.join("")}amix=inputs=${1 + overlayTimings.length}:duration=first:normalize=0[aout]`
      );
    } else {
      filterParts.push(`[body_a]acopy[aout]`);
    }
  } else {
    filterParts.push(`anullsrc=r=44100:cl=stereo[aout]`);
  }

  const filterComplex = filterParts.join(";");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", "30",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ];

  await exec("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
}
