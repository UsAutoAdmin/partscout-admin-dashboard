import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import {
  BROLL_DIR,
  LUT_PATH,
  RISER_PATH,
  VIDEO_WIDTH,
  HALF_HEIGHT,
} from "./constants";

const exec = promisify(execFile);

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

async function pickRandomBroll(): Promise<string> {
  const files = (await fs.readdir(BROLL_DIR)).filter((f) =>
    /\.(mp4|mov|mkv|avi|webm)$/i.test(f)
  );
  if (files.length === 0) throw new Error("No B-roll clips found in media/broll/");
  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(BROLL_DIR, pick);
}

let _drawtextAvailable: boolean | null = null;
async function canUseDrawtext(): Promise<boolean> {
  if (_drawtextAvailable !== null) return _drawtextAvailable;
  try {
    const { stdout } = await exec("ffmpeg", ["-filters", "-v", "quiet"]);
    _drawtextAvailable = stdout.includes("drawtext");
  } catch {
    _drawtextAvailable = false;
  }
  return _drawtextAvailable;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\\\:")
    .replace(/%/g, "%%");
}

export async function processHook(
  hookPath: string,
  bodyPath: string,
  hookText: string,
  outputPath: string
): Promise<{ brollFile: string }> {
  const brollPath = await pickRandomBroll();
  const hookDuration = await getVideoDuration(hookPath);
  const brollDuration = await getVideoDuration(brollPath);
  const hookHasAudio = await hasAudioStream(hookPath);
  const drawtext = await canUseDrawtext();

  const brollStart =
    brollDuration > hookDuration
      ? Math.random() * (brollDuration - hookDuration)
      : 0;

  const useLut = await fs.access(LUT_PATH).then(() => true).catch(() => false);
  const useRiser = await fs.access(RISER_PATH).then(() => true).catch(() => false);

  const processedHookPath = outputPath.replace(/\.mp4$/, "_hook_only.mp4");

  const inputs: string[] = [];

  // Input 0: B-roll (with optional loop for short clips)
  if (brollDuration < hookDuration) {
    inputs.push("-stream_loop", "-1");
  }
  inputs.push("-ss", brollStart.toFixed(2), "-i", brollPath);

  // Input 1: Hook (talking head)
  inputs.push("-i", hookPath);

  // Input 2: Riser SFX (optional)
  if (useRiser) inputs.push("-i", RISER_PATH);

  let lutFilter = useLut ? `,lut3d='${LUT_PATH}'` : "";

  const brollFilter = `[0:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}${lutFilter},setpts=PTS-STARTPTS[broll]`;
  const headFilter = `[1:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}${lutFilter}[head]`;
  const stackFilter = `[broll][head]vstack=inputs=2[stacked]`;

  let textFilter: string;
  if (drawtext) {
    const escaped = escapeDrawtext(hookText);
    textFilter = `[stacked]drawtext=text='${escaped}':fontfile='/System/Library/Fonts/Supplemental/Impact.ttf':fontsize=80:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h/2-text_h/2)[vout]`;
  } else {
    // Skip text overlay when drawtext isn't available -- just pass through
    console.warn("[video-gen] drawtext filter not available, skipping text overlay. Install ffmpeg with --enable-libfreetype for text support.");
    textFilter = `[stacked]copy[vout]`;
  }

  let audioFilter: string;
  const riserIdx = useRiser ? 2 : -1;

  if (hookHasAudio && useRiser) {
    audioFilter = `[1:a][${riserIdx}:a]amix=inputs=2:duration=shortest:normalize=0[aout]`;
  } else if (hookHasAudio) {
    audioFilter = `[1:a]acopy[aout]`;
  } else if (useRiser) {
    audioFilter = `[${riserIdx}:a]acopy[aout]`;
  } else {
    audioFilter = `anullsrc=r=44100:cl=stereo[aout]`;
  }

  const filterComplex = [brollFilter, headFilter, stackFilter, textFilter, audioFilter].join(";");

  const ffmpegArgs = [
    "-y",
    ...inputs,
    "-t", hookDuration.toFixed(2),
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", "30",
  ];

  if (!hookHasAudio && !useRiser) {
    ffmpegArgs.push("-shortest");
  }

  ffmpegArgs.push(processedHookPath);

  await exec("ffmpeg", ffmpegArgs);

  // Concat processed hook + body
  const concatListPath = outputPath.replace(/\.mp4$/, "_concat.txt");
  await fs.writeFile(
    concatListPath,
    `file '${processedHookPath}'\nfile '${bodyPath}'\n`
  );

  await exec("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", "30",
    "-movflags", "+faststart",
    outputPath,
  ]);

  await fs.unlink(processedHookPath).catch(() => {});
  await fs.unlink(concatListPath).catch(() => {});

  return { brollFile: path.basename(brollPath) };
}

export async function processAllHooks(
  hookPaths: string[],
  bodyPath: string,
  hookTexts: string[],
  jobDir: string,
  onProgress: (hookIndex: number, brollFile: string, outputFile: string) => void
): Promise<void> {
  await fs.mkdir(jobDir, { recursive: true });

  for (let i = 0; i < hookPaths.length; i++) {
    const outputFile = `video_${i + 1}.mp4`;
    const outputPath = path.join(jobDir, outputFile);
    const { brollFile } = await processHook(
      hookPaths[i],
      bodyPath,
      hookTexts[i],
      outputPath
    );
    onProgress(i, brollFile, outputFile);
  }
}
