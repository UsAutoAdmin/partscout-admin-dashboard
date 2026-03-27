import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import {
  BROLL_DIR,
  LUT_PATH,
  RISER_PATH,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  HALF_HEIGHT,
  COLOR_GRADE_FILTER,
} from "./constants";
import { generateBannerImage } from "./hook-banner";

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


/**
 * Process a single hook: B-roll top half + talking head bottom half +
 * green text banner at the center + riser SFX.
 * Then concatenate with the composed body to produce the final video.
 */
export async function processHookWithBody(
  hookPath: string,
  composedBodyPath: string,
  outputPath: string,
  hookText?: string
): Promise<{ brollFile: string }> {
  const brollPath = await pickRandomBroll();
  const hookDuration = await getVideoDuration(hookPath);
  const brollDuration = await getVideoDuration(brollPath);
  const hookHasAudio = await hasAudioStream(hookPath);

  const brollStart =
    brollDuration > hookDuration
      ? Math.random() * (brollDuration - hookDuration)
      : 0;

  const useLut = await fs.access(LUT_PATH).then(() => true).catch(() => false);
  const useRiser = await fs.access(RISER_PATH).then(() => true).catch(() => false);

  let bannerPath: string | null = null;
  if (hookText) {
    bannerPath = outputPath.replace(/\.mp4$/, "_banner.png");
    await generateBannerImage(hookText, bannerPath);
  }

  const processedHookPath = outputPath.replace(/\.mp4$/, "_hook_only.mp4");

  const inputs: string[] = [];

  if (brollDuration < hookDuration) {
    inputs.push("-stream_loop", "-1");
  }
  inputs.push("-ss", brollStart.toFixed(2), "-i", brollPath);
  inputs.push("-i", hookPath);
  if (useRiser) inputs.push("-i", RISER_PATH);

  let bannerIdx = -1;
  if (bannerPath) {
    bannerIdx = (useRiser ? 3 : 2);
    inputs.push("-i", bannerPath);
  }

  const lutFilter = useLut ? `,lut3d='${LUT_PATH}'` : "";

  const gradeFilter = `,${COLOR_GRADE_FILTER}`;
  const exactSize = `,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}`;
  const brollFilter = `[0:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT},setsar=1${lutFilter}${gradeFilter}${exactSize},setpts=PTS-STARTPTS,format=yuv420p[broll]`;
  const headFilter = `[1:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT},setsar=1${lutFilter}${gradeFilter}${exactSize},format=yuv420p[head]`;
  const stackFilter = `[broll][head]vstack=inputs=2[stacked]`;

  let bannerFilter: string;
  if (bannerPath && bannerIdx >= 0) {
    bannerFilter = `[stacked][${bannerIdx}:v]overlay=(W-w)/2:(H-h)/2:format=auto[vout]`;
  } else {
    bannerFilter = `[stacked]copy[vout]`;
  }

  let audioFilter: string;
  const riserIdx = useRiser ? 2 : -1;

  if (hookHasAudio && useRiser) {
    audioFilter = `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[ha];[${riserIdx}:a]volume=-12dB,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[ra];[ha][ra]amix=inputs=2:duration=first:normalize=0[aout]`;
  } else if (hookHasAudio) {
    audioFilter = `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`;
  } else if (useRiser) {
    audioFilter = `[${riserIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`;
  } else {
    audioFilter = `anullsrc=r=44100:cl=stereo[aout]`;
  }

  const filterComplex = [brollFilter, headFilter, stackFilter, bannerFilter, audioFilter].join(";");

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

  if (bannerPath) await fs.unlink(bannerPath).catch(() => {});

  // Concat processed hook + composed body
  const bodyHasAudio = await hasAudioStream(composedBodyPath);

  const concatFilter = [
    `[0:v]setpts=PTS-STARTPTS[hv]`,
    `[1:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,setpts=PTS-STARTPTS,format=yuv420p[bv]`,
    bodyHasAudio
      ? `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ba]`
      : `anullsrc=r=44100:cl=stereo[ba]`,
    `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ha]`,
    `[hv][ha][bv][ba]concat=n=2:v=1:a=1[vfinal][afinal]`,
  ].join(";");

  const concatArgs = [
    "-y",
    "-i", processedHookPath,
    "-i", composedBodyPath,
    "-filter_complex", concatFilter,
    "-map", "[vfinal]",
    "-map", "[afinal]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-r", "30",
    "-movflags", "+faststart",
    outputPath,
  ];

  if (!bodyHasAudio) {
    concatArgs.splice(concatArgs.indexOf("-movflags"), 0, "-shortest");
  }

  await exec("ffmpeg", concatArgs);

  await fs.unlink(processedHookPath).catch(() => {});

  return { brollFile: path.basename(brollPath) };
}

/**
 * Legacy: process hook with text overlay (kept for backward compatibility).
 */
export async function processHook(
  hookPath: string,
  bodyPath: string,
  hookText: string,
  outputPath: string
): Promise<{ brollFile: string }> {
  return processHookWithBody(hookPath, bodyPath, outputPath, hookText);
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
