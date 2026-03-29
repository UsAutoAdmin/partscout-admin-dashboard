import { exec as execCb } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
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
import { buildCaptionDrawtext, CaptionChunk } from "./captions";

const execAsync = promisify(execCb);
const SSH_USER = "chaseeriksson";
const REMOTE_FFMPEG = "~/bin/ffmpeg";
const REMOTE_FFPROBE = "~/bin/ffprobe";
const SSH_OPTS = "-o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no";

export interface RemoteWorker {
  host: string;
  label: string;
}

export const REMOTE_WORKERS: RemoteWorker[] = [
  { host: "100.100.6.101", label: "Mac Mini 2" },
  { host: "100.68.192.57", label: "Mac Mini 3" },
];

async function ssh(host: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(
    `ssh ${SSH_OPTS} ${SSH_USER}@${host} '${cmd.replace(/'/g, "'\\''")}'`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout.trim();
}

async function scp(localPath: string, host: string, remotePath: string): Promise<void> {
  await execAsync(
    `scp ${SSH_OPTS} "${localPath}" ${SSH_USER}@${host}:"${remotePath}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
}

async function scpFrom(host: string, remotePath: string, localPath: string): Promise<void> {
  await execAsync(
    `scp ${SSH_OPTS} ${SSH_USER}@${host}:"${remotePath}" "${localPath}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );
}

function fileExists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

async function pickRandomBroll(): Promise<string> {
  const files = (await fs.readdir(BROLL_DIR)).filter((f) =>
    /\.(mp4|mov|mkv|avi|webm)$/i.test(f)
  );
  if (files.length === 0) throw new Error("No B-roll clips found in media/broll/");
  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(BROLL_DIR, pick);
}

async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
    { maxBuffer: 5 * 1024 * 1024 }
  );
  const info = JSON.parse(stdout);
  return parseFloat(info.format.duration);
}

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -select_streams a -show_entries stream=codec_type -print_format json "${filePath}"`,
      { maxBuffer: 5 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout);
    return (info.streams?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function checkRemoteAvailable(host: string): Promise<boolean> {
  try {
    const out = await ssh(host, `${REMOTE_FFMPEG} -version 2>/dev/null | head -1`);
    return out.includes("ffmpeg");
  } catch {
    return false;
  }
}

/**
 * Process a hook + body on a remote machine via SSH/SCP.
 * Returns the same result shape as the local processHookWithBody.
 */
export async function processHookWithBodyRemote(
  hookPath: string,
  composedBodyPath: string,
  outputPath: string,
  host: string,
  hookText?: string,
  hookCaptions?: CaptionChunk[],
  hookSegmentStart?: number
): Promise<{ brollFile: string }> {
  const workId = crypto.randomBytes(6).toString("hex");
  const remoteDir = `/tmp/vgen_${workId}`;

  const brollPath = await pickRandomBroll();
  const hookDuration = await getVideoDuration(hookPath);
  const brollDuration = await getVideoDuration(brollPath);
  const hookHasAudio = await hasAudioStream(hookPath);

  const useLut = await fileExists(LUT_PATH);
  const useRiser = await fileExists(RISER_PATH);
  const brollStart = brollDuration > hookDuration
    ? Math.random() * (brollDuration - hookDuration)
    : 0;

  let localBannerPath: string | null = null;
  if (hookText) {
    localBannerPath = hookPath.replace(/\.mp4$/, "_remote_banner.png");
    await generateBannerImage(hookText, localBannerPath);
  }

  const rHook = `${remoteDir}/hook.mp4`;
  const rBody = `${remoteDir}/body.mp4`;
  const rBroll = `${remoteDir}/broll${path.extname(brollPath)}`;
  const rRiser = `${remoteDir}/riser.mp3`;
  const rLut = `${remoteDir}/grade.cube`;
  const rBanner = `${remoteDir}/banner.png`;
  const rHookOnly = `${remoteDir}/hook_only.mp4`;
  const rOutput = `${remoteDir}/output.mp4`;

  await ssh(host, `mkdir -p ${remoteDir}`);

  const transfers: Promise<void>[] = [
    scp(hookPath, host, rHook),
    scp(composedBodyPath, host, rBody),
    scp(brollPath, host, rBroll),
  ];
  if (useRiser) transfers.push(scp(RISER_PATH, host, rRiser));
  if (useLut) transfers.push(scp(LUT_PATH, host, rLut));
  if (localBannerPath) transfers.push(scp(localBannerPath, host, rBanner));
  await Promise.all(transfers);

  // Build hook composition filter (same logic as local ffmpeg-pipeline.ts)
  const lutFilter = useLut ? `,lut3d='${rLut}'` : "";

  const inputArgs: string[] = [];
  if (brollDuration < hookDuration) inputArgs.push("-stream_loop -1");
  inputArgs.push(`-ss ${brollStart.toFixed(2)} -i ${rBroll}`);
  inputArgs.push(`-i ${rHook}`);
  if (useRiser) inputArgs.push(`-i ${rRiser}`);

  let bannerIdx = -1;
  if (localBannerPath) {
    bannerIdx = useRiser ? 3 : 2;
    inputArgs.push(`-i ${rBanner}`);
  }

  const gradeFilter = `,${COLOR_GRADE_FILTER}`;
  const exactSize = `,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}`;
  const brollFilter = `[0:v]setsar=1,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}:(iw-${VIDEO_WIDTH})/2:(ih-${HALF_HEIGHT})/2${lutFilter}${gradeFilter}${exactSize},setpts=PTS-STARTPTS,format=yuv420p[broll]`;
  const headFilter = `[1:v]setsar=1,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}:(iw-${VIDEO_WIDTH})/2:(ih-${HALF_HEIGHT})/2${lutFilter}${gradeFilter}${exactSize},format=yuv420p[head]`;
  const captionFilter = (hookCaptions && hookCaptions.length > 0)
    ? buildCaptionDrawtext(hookCaptions, hookSegmentStart ?? 0)
    : "";

  const stackFilter = captionFilter
    ? `[broll][head]vstack=inputs=2,${captionFilter}[stacked]`
    : `[broll][head]vstack=inputs=2[stacked]`;

  let bannerFilter: string;
  if (localBannerPath && bannerIdx >= 0) {
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

  let hookCmd = `${REMOTE_FFMPEG} -y ${inputArgs.join(" ")} -t ${hookDuration.toFixed(2)}`;
  hookCmd += ` -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]"`;
  hookCmd += ` -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -r 30`;
  if (!hookHasAudio && !useRiser) hookCmd += ` -shortest`;
  hookCmd += ` ${rHookOnly}`;

  await ssh(host, hookCmd);

  // Probe body audio remotely
  let bodyHasAudio = false;
  try {
    const probeOut = await ssh(
      host,
      `${REMOTE_FFPROBE} -v quiet -select_streams a -show_entries stream=codec_type -print_format json ${rBody}`
    );
    const probeInfo = JSON.parse(probeOut);
    bodyHasAudio = (probeInfo.streams?.length ?? 0) > 0;
  } catch {}

  // Concat hook + body
  const concatFilterParts = [
    `[0:v]setpts=PTS-STARTPTS[hv]`,
    `[1:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,setpts=PTS-STARTPTS,format=yuv420p[bv]`,
    bodyHasAudio
      ? `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ba]`
      : `anullsrc=r=44100:cl=stereo[ba]`,
    `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ha]`,
    `[hv][ha][bv][ba]concat=n=2:v=1:a=1[vfinal][afinal]`,
  ].join(";");

  let concatCmd = `${REMOTE_FFMPEG} -y -i ${rHookOnly} -i ${rBody}`;
  concatCmd += ` -filter_complex "${concatFilterParts}" -map "[vfinal]" -map "[afinal]"`;
  concatCmd += ` -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -r 30`;
  if (!bodyHasAudio) concatCmd += ` -shortest`;
  concatCmd += ` -movflags +faststart ${rOutput}`;

  await ssh(host, concatCmd);

  await scpFrom(host, rOutput, outputPath);

  ssh(host, `rm -rf ${remoteDir}`).catch(() => {});
  if (localBannerPath) await fs.unlink(localBannerPath).catch(() => {});

  return { brollFile: path.basename(brollPath) };
}
