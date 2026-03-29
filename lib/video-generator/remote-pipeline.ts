/**
 * Full video generation pipeline executed on a remote Mac Mini via SSH/SCP.
 * Heavy FFmpeg + transcription runs on remote; LLM/API/Playwright stays local.
 */

import { exec as execCb } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  UPLOADS_DIR,
  OUTPUT_DIR,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  HALF_HEIGHT,
  COLOR_GRADE_FILTER,
  REMOTE_PYTHON_BIN,
  REMOTE_FFMPEG_BIN,
  REMOTE_FFPROBE_BIN,
  REMOTE_FONT_PATH,
  REMOTE_LUT_PATH,
  REMOTE_RISER_PATH,
  REMOTE_CLICK_PATH,
  REMOTE_BROLL_DIR,
  REMOTE_TRANSCRIBE_SCRIPT,
} from "./constants";
import {
  segmentsFromSilenceStructured,
  validateBodySegment,
  SilenceRange,
  Segment,
} from "./silence-detect";
import { TranscriptWord, TranscriptResult } from "./transcribe";
import { detectOverlayTimestamps, OverlayDetectionResult } from "./overlay-detect";
import { matchScriptEntry } from "./script-sheet";
import { generateHookTexts, generateBannerImage } from "./hook-banner";
import { findPriceCard, downloadPriceCardImage } from "./price-lookup";
import { findCarImage, downloadCarImage, closeBrowser as closeCarBrowser } from "./car-image";
import { buildSoldSearchUrl, scrapeEbaySoldListings, closeBrowser as closeEbayBrowser } from "./ebay-scraper";
import { OverlayEntry } from "./body-pipeline";
import { analyzeHookQuality } from "./stumble-detect";
import { captionsForSegment, CaptionChunk, buildCaptionDrawtext } from "./captions";
import type { AutoJobStatus, HookFlag } from "./pipeline-types";

const execAsync = promisify(execCb);
const SSH_USER = "chaseeriksson";
const SSH_OPTS = "-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no";

async function ssh(host: string, cmd: string, timeoutMs = 600_000): Promise<string> {
  const { stdout } = await execAsync(
    `ssh ${SSH_OPTS} ${SSH_USER}@${host} '${cmd.replace(/'/g, "'\\''")}'`,
    { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs }
  );
  return stdout.trim();
}

async function scp(localPath: string, host: string, remotePath: string): Promise<void> {
  await execAsync(
    `scp ${SSH_OPTS} "${localPath}" ${SSH_USER}@${host}:"${remotePath}"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 }
  );
}

async function scpFrom(host: string, remotePath: string, localPath: string): Promise<void> {
  await execAsync(
    `scp ${SSH_OPTS} ${SSH_USER}@${host}:"${remotePath}" "${localPath}"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 }
  );
}

type JobUpdater = (patch: Partial<AutoJobStatus>) => void;

/**
 * Run the full auto pipeline on a remote Mac Mini.
 * Heavy compute (FFmpeg, transcription) goes via SSH.
 * LLM/API/Playwright operations stay on the local orchestrator.
 */
export async function runPipelineRemote(
  rawVideoPath: string,
  jobId: string,
  host: string,
  updateJob: JobUpdater
): Promise<void> {
  const jobDir = path.join(UPLOADS_DIR, jobId);
  const outputDir = path.join(OUTPUT_DIR, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  const workId = crypto.randomBytes(6).toString("hex");
  const remoteDir = `/tmp/vgen_${workId}`;

  try {
    await ssh(host, `mkdir -p ${remoteDir}`);

    // ── 1. Upload raw video to remote ──
    updateJob({ phase: "analyzing", progress: "Uploading video to remote worker..." });
    const remoteRaw = `${remoteDir}/raw.mp4`;
    await scp(rawVideoPath, host, remoteRaw);

    // ── 2. Silence detection + audio extraction + transcription on remote ──
    updateJob({ progress: "Analyzing audio on remote..." });

    const remoteAudio = `${remoteDir}/raw_audio.wav`;

    const [silenceJson, , durationStr] = await Promise.all([
      ssh(host, `${REMOTE_FFMPEG_BIN} -vn -i ${remoteRaw} -af "silencedetect=noise=-30dB:d=0.5" -f null - 2>&1 | grep -E "silence_(start|end)" || true`),
      ssh(host, `${REMOTE_FFMPEG_BIN} -y -vn -i ${remoteRaw} -acodec pcm_s16le -ar 16000 -ac 1 ${remoteAudio} 2>&1 | tail -1`),
      ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -print_format json -show_format ${remoteRaw}`),
    ]);

    const totalDuration = parseFloat(JSON.parse(durationStr).format.duration);
    const silenceRanges = parseSilenceOutput(silenceJson);

    console.log(`[remote-pipeline] ${host}: ${silenceRanges.length} silence gaps, duration ${totalDuration.toFixed(1)}s`);

    // ── 3. Transcription on remote ──
    updateJob({ phase: "transcribing", progress: "Transcribing on remote..." });

    const transcriptJson = await ssh(
      host,
      `${REMOTE_PYTHON_BIN} ${REMOTE_TRANSCRIBE_SCRIPT} ${remoteAudio}`,
      300_000
    );
    const transcriptResult: TranscriptResult = JSON.parse(transcriptJson);
    const words = transcriptResult.words;

    // Clean up remote audio immediately
    ssh(host, `rm -f ${remoteAudio}`).catch(() => {});

    // ── 4. Segmentation (pure JS, runs locally) ──
    const rawSegments = segmentsFromSilenceStructured(silenceRanges, totalDuration, 5);
    const trimmedSegments = await trimSegmentEdgesLocal(rawSegments, words);
    const segments = validateBodySegment(trimmedSegments, words);

    const hooks = segments.filter((s) => s.label.startsWith("Hook"));
    const bodySegment = segments.find((s) => s.label === "Body");
    if (!bodySegment) throw new Error("No body segment detected in video");

    updateJob({
      totalHooks: hooks.length,
      progress: `Found ${hooks.length} hooks + 1 body`,
      segments,
      transcript: words,
    });

    // ── 4b. Stumble detection (LLM, local) ──
    const hookFlags: HookFlag[] = [];
    for (let i = 0; i < hooks.length; i++) {
      const quality = await analyzeHookQuality(words, hooks[i].start, hooks[i].end);
      hookFlags.push({ index: i, flagged: quality.flagged, reason: quality.reason });
      if (quality.flagged) console.log(`[remote-pipeline] Hook ${i + 1} flagged: ${quality.reason}`);
    }
    updateJob({ hookFlags });

    // ── 5. Extract segments on remote ──
    updateJob({ phase: "splitting", progress: "Extracting segments on remote..." });

    for (const seg of segments) {
      const filename = seg.label === "Body" ? "body_segment.mp4" : `hook_${seg.index}.mp4`;
      const remoteSeg = `${remoteDir}/${filename}`;
      await ssh(host, `${REMOTE_FFMPEG_BIN} -y -ss ${seg.start.toFixed(3)} -i ${remoteRaw} -t ${(seg.end - seg.start).toFixed(3)} -c copy -avoid_negative_ts make_zero ${remoteSeg}`);
    }

    // ── 6. Overlay detection (LLM, local) ──
    updateJob({ phase: "detecting", progress: "Detecting overlay timestamps..." });

    const detection: OverlayDetectionResult = await detectOverlayTimestamps(words);
    const scriptMatch = matchScriptEntry(detection.car?.text, detection.part?.text);
    if (scriptMatch) {
      const correctedCar = [scriptMatch.year, scriptMatch.make, scriptMatch.model].filter(Boolean).join(" ");
      if (detection.car) detection.car = { ...detection.car, text: correctedCar };
      else detection.car = { text: correctedCar, start: 0, end: 0 };
      if (detection.part) detection.part = { ...detection.part, text: scriptMatch.part };
      else detection.part = { text: scriptMatch.part, start: 0, end: 0 };
    }

    const videoBaseName = [detection.car?.text, detection.part?.text]
      .filter(Boolean).join(" ").replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Video";

    updateJob({ videoName: videoBaseName, overlayDetection: detection });

    // ── 7. Fetch overlay images (Playwright/Supabase, local) ──
    updateJob({ phase: "fetching_overlays", progress: "Fetching overlay images..." });

    const bodyOffset = bodySegment.start;
    const toBodyRelative = (rawTs: number) => Math.max(0, rawTs - bodyOffset);
    const overlayEntries: OverlayEntry[] = [];
    const overlaySlots: { slot: string; filename: string }[] = [];

    await fetchOverlaysLocal(detection, jobDir, toBodyRelative, overlayEntries, overlaySlots);

    updateJob({ progress: `Got ${overlayEntries.length} overlay images`, overlaySlots });

    // ── 8. SCP overlay images to remote ──
    for (const oe of overlayEntries) {
      const remoteDest = `${remoteDir}/${path.basename(oe.imagePath)}`;
      await scp(oe.imagePath, host, remoteDest);
    }

    // ── 9. Compose body on remote ──
    updateJob({ phase: "composing_body", progress: "Composing body on remote..." });

    const bodyCaptions = await captionsForSegment(words, bodySegment.start, bodySegment.end);
    const remoteBody = `${remoteDir}/body_segment.mp4`;
    const remoteComposed = `${remoteDir}/body_composed.mp4`;

    await composeBodyRemote(
      host, remoteDir, remoteBody, remoteComposed,
      overlayEntries.map((oe) => ({
        ...oe,
        imagePath: `${remoteDir}/${path.basename(oe.imagePath)}`,
      })),
      bodyCaptions,
      bodySegment.start
    );

    // ── 10. Generate hook texts + captions (LLM, local) ──
    const hookTexts = await generateHookTexts(hooks.length, {
      partName: detection.part?.text,
      carName: detection.car?.text,
      yardPrice: detection.price?.text,
      soldPrice: detection.soldPrice?.text,
    });
    updateJob({ hookTexts });

    const hookCaptionSets: CaptionChunk[][] = [];
    for (const hook of hooks) {
      hookCaptionSets.push(await captionsForSegment(words, hook.start, hook.end));
    }

    // ── 11. Generate banners locally, SCP to remote ──
    const localBannerPaths: (string | null)[] = [];
    for (let i = 0; i < hooks.length; i++) {
      const text = hookTexts[i];
      if (text) {
        const bannerLocal = path.join(jobDir, `banner_${i}.png`);
        await generateBannerImage(text, bannerLocal);
        await scp(bannerLocal, host, `${remoteDir}/banner_${i}.png`);
        localBannerPaths.push(bannerLocal);
      } else {
        localBannerPaths.push(null);
      }
    }

    // ── 12. Render hooks on remote (sequential, same machine) ──
    updateJob({ phase: "generating_hooks", progress: "Rendering final videos on remote..." });

    const safeName = videoBaseName.replace(/[/\\?%*:|"<>]/g, "").trim();
    const outputFiles: string[] = [];

    for (let i = 0; i < hooks.length; i++) {
      const hookFile = `hook_${segments.indexOf(hooks[i])}.mp4`;
      const remoteHook = `${remoteDir}/${hookFile}`;
      const outputFile = `${safeName} - ${i + 1}.mp4`;
      const remoteOutput = `${remoteDir}/output_${i}.mp4`;

      const hookCaptions = hookCaptionSets[i] || [];
      const hookText = hookTexts[i] || undefined;
      const remoteBanner = hookText ? `${remoteDir}/banner_${i}.png` : null;

      await processHookRemote(
        host, remoteDir, remoteHook, remoteComposed, remoteOutput,
        remoteBanner, hookCaptions, hooks[i].start
      );

      const localOutput = path.join(outputDir, outputFile);
      await scpFrom(host, remoteOutput, localOutput);
      outputFiles.push(outputFile);

      updateJob({
        currentHook: i + 1,
        progress: `Rendered ${i + 1}/${hooks.length} videos`,
      });
    }

    // ── 13. Copy segment files back for manual editing bridge ──
    for (const seg of segments) {
      const filename = seg.label === "Body" ? "body_segment.mp4" : `hook_${seg.index}.mp4`;
      const localPath = path.join(jobDir, filename);
      try {
        await fs.access(localPath);
      } catch {
        await scpFrom(host, `${remoteDir}/${filename}`, localPath);
      }
    }
    try {
      const localComposed = path.join(jobDir, "body_composed.mp4");
      await fs.access(localComposed);
    } catch {
      await scpFrom(host, remoteComposed, path.join(jobDir, "body_composed.mp4"));
    }

    // Cleanup local banners
    for (const bp of localBannerPaths) {
      if (bp) await fs.unlink(bp).catch(() => {});
    }

    updateJob({
      phase: "done",
      progress: `${outputFiles.length} videos ready`,
      outputFiles,
      completedAt: Date.now(),
    });
  } finally {
    // Always clean up remote working directory
    ssh(host, `rm -rf ${remoteDir}`).catch(() => {});
  }
}

// ─── Helper: Parse FFmpeg silencedetect stderr output ────────────────────────

function parseSilenceOutput(text: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  const lines = text.split("\n");

  const starts: number[] = [];
  for (const line of lines) {
    const startMatch = /silence_start:\s*([\d.]+)/.exec(line);
    if (startMatch) starts.push(parseFloat(startMatch[1]));
  }

  let idx = 0;
  for (const line of lines) {
    const endMatch = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/.exec(line);
    if (endMatch) {
      ranges.push({
        start: starts[idx] ?? parseFloat(endMatch[1]) - parseFloat(endMatch[2]),
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      idx++;
    }
  }

  return ranges;
}

// ─── Helper: Trim segment edges using transcript (no FFmpeg needed) ──────────

async function trimSegmentEdgesLocal(segments: Segment[], words: TranscriptWord[]): Promise<Segment[]> {
  const PAD_BEFORE = 0.08;
  const PAD_AFTER = 0.15;

  return segments.map((seg) => {
    const segWords = words.filter((w) => w.start >= seg.start - 0.1 && w.end <= seg.end + 0.1);
    if (segWords.length === 0) return seg;

    let newStart = segWords[0].start - PAD_BEFORE;
    let newEnd = segWords[segWords.length - 1].end + PAD_AFTER;

    newStart = Math.max(seg.start, newStart);
    newEnd = Math.min(seg.end, newEnd);

    if (newEnd - newStart < 0.5) return seg;

    return { ...seg, start: Math.max(0, newStart), end: newEnd };
  });
}

// ─── Helper: Fetch overlays locally (Playwright/Supabase) ────────────────────

async function fetchOverlaysLocal(
  detection: OverlayDetectionResult,
  jobDir: string,
  toBodyRelative: (t: number) => number,
  overlayEntries: OverlayEntry[],
  overlaySlots: { slot: string; filename: string }[]
): Promise<void> {
  const fetches: Promise<void>[] = [];

  if (detection.part?.text) {
    fetches.push((async () => {
      try {
        const match = await findPriceCard(detection.part!.text);
        if (match && match.image_url) {
          const dest = path.join(jobDir, "auto_price.jpg");
          await downloadPriceCardImage(match.image_url, dest);
          overlayEntries.push({ slot: "price", imagePath: dest, timestamp: toBodyRelative(detection.price?.start ?? detection.part!.start) });
          overlaySlots.push({ slot: "price", filename: "auto_price.jpg" });
        }
      } catch (e: any) { console.log(`[remote-pipeline] Price card failed: ${e.message}`); }
    })());
  }

  if (detection.car?.text) {
    fetches.push((async () => {
      try {
        const result = await findCarImage(detection.car!.text);
        if (result) {
          const dest = path.join(jobDir, "auto_car.jpg");
          await downloadCarImage(result.imageUrl, dest, (result as any)._candidates);
          overlayEntries.push({ slot: "car", imagePath: dest, timestamp: toBodyRelative(detection.car!.start) });
          overlaySlots.push({ slot: "car", filename: "auto_car.jpg" });
        }
      } catch (e: any) { console.log(`[remote-pipeline] Car image failed: ${e.message}`); }
      finally { await closeCarBrowser(); }
    })());
  }

  if (detection.part?.text && detection.car?.text) {
    fetches.push((async () => {
      try {
        const searchUrl = buildSoldSearchUrl(detection.part!.text, detection.car!.text);
        const partDest = path.join(jobDir, "auto_part.jpg");
        const soldDest = path.join(jobDir, "auto_sold.png");
        let targetPrice: number | undefined;
        if (detection.soldPrice?.text) {
          const numMatch = detection.soldPrice.text.match(/\d+/);
          if (numMatch) targetPrice = parseFloat(numMatch[0]);
        }
        const result = await scrapeEbaySoldListings(searchUrl, partDest, soldDest, targetPrice);
        if (result.partImageSaved) {
          overlayEntries.push({ slot: "part", imagePath: partDest, timestamp: toBodyRelative(detection.part!.start) });
          overlaySlots.push({ slot: "part", filename: "auto_part.jpg" });
        }
        if (result.soldScreenshotSaved && detection.soldPrice) {
          overlayEntries.push({ slot: "soldPrice", imagePath: soldDest, timestamp: toBodyRelative(detection.soldPrice.start) });
          overlaySlots.push({ slot: "soldPrice", filename: "auto_sold.png" });
        }
      } catch (e: any) { console.log(`[remote-pipeline] eBay failed: ${e.message}`); }
      finally { await closeEbayBrowser(); }
    })());
  }

  await Promise.all(fetches);
}

// ─── Remote body composition via SSH ─────────────────────────────────────────

async function composeBodyRemote(
  host: string,
  remoteDir: string,
  remoteBodyVideo: string,
  remoteOutput: string,
  overlays: OverlayEntry[],
  bodyCaptions: CaptionChunk[],
  bodySegmentStart: number
): Promise<void> {
  const durationStr = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -print_format json -show_format ${remoteBodyVideo}`);
  const bodyDuration = parseFloat(JSON.parse(durationStr).format.duration);

  let bodyHasAudio = false;
  try {
    const probeOut = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -select_streams a -show_entries stream=codec_type -print_format json ${remoteBodyVideo}`);
    bodyHasAudio = (JSON.parse(probeOut).streams?.length ?? 0) > 0;
  } catch {}

  const lutExists = await ssh(host, `test -f ${REMOTE_LUT_PATH} && echo yes || echo no`) === "yes";
  const clickExists = await ssh(host, `test -f ${REMOTE_CLICK_PATH} && echo yes || echo no`) === "yes";
  const lutFilter = lutExists ? `,lut3d='${REMOTE_LUT_PATH}'` : "";
  const gradeFilter = `,${COLOR_GRADE_FILTER}`;

  const sortedOverlays = [...overlays].sort((a, b) => a.timestamp - b.timestamp);

  const inputArgs: string[] = [`-i ${remoteBodyVideo}`];
  for (const o of sortedOverlays) inputArgs.push(`-i ${o.imagePath}`);
  const clickIdx = clickExists ? 1 + sortedOverlays.length : -1;
  if (clickExists) inputArgs.push(`-i ${REMOTE_CLICK_PATH}`);

  const filterParts: string[] = [];

  filterParts.push(
    `[0:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${VIDEO_WIDTH}:${HALF_HEIGHT},setsar=1${lutFilter}${gradeFilter},` +
    `scale=${VIDEO_WIDTH}:${HALF_HEIGHT},format=yuv420p[body_bottom]`
  );

  filterParts.push(
    `color=black:s=${VIDEO_WIDTH}x${HALF_HEIGHT}:r=30:d=${bodyDuration.toFixed(3)},format=yuv420p[top_base]`
  );

  const overlayTimings: { start: number; end: number }[] = [];
  if (sortedOverlays.length > 0) {
    const firstStart = sortedOverlays[0].timestamp;
    const totalSpan = bodyDuration - firstStart;
    const perOverlay = totalSpan / sortedOverlays.length;
    for (let i = 0; i < sortedOverlays.length; i++) {
      const start = firstStart + i * perOverlay;
      const end = i === sortedOverlays.length - 1 ? bodyDuration : firstStart + (i + 1) * perOverlay;
      overlayTimings.push({ start, end });
    }
  }

  let currentTop = "top_base";
  for (let i = 0; i < sortedOverlays.length; i++) {
    const imgIdx = 1 + i;
    const { start: startT, end: endT } = overlayTimings[i];
    filterParts.push(
      `[${imgIdx}:v]scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${VIDEO_WIDTH}:${HALF_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[ovl_${i}]`
    );
    const nextTop = `top_${i}`;
    filterParts.push(
      `[${currentTop}][ovl_${i}]overlay=0:0:enable='between(t,${startT.toFixed(3)},${endT.toFixed(3)})'[${nextTop}]`
    );
    currentTop = nextTop;
  }

  const captionFilter = bodyCaptions.length > 0
    ? buildCaptionDrawtext(bodyCaptions, bodySegmentStart, REMOTE_FONT_PATH)
    : "";

  if (captionFilter) {
    filterParts.push(`[${currentTop}][body_bottom]vstack=inputs=2,${captionFilter}[vout]`);
  } else {
    filterParts.push(`[${currentTop}][body_bottom]vstack=inputs=2[vout]`);
  }

  if (bodyHasAudio) {
    filterParts.push(`[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[body_a]`);
    if (clickExists && overlayTimings.length > 0) {
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

  let cmd = `${REMOTE_FFMPEG_BIN} -y ${inputArgs.join(" ")}`;
  cmd += ` -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]"`;
  cmd += ` -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -r 30 -shortest -movflags +faststart`;
  cmd += ` ${remoteOutput}`;

  await ssh(host, cmd);
}

// ─── Remote hook composition via SSH ─────────────────────────────────────────

async function processHookRemote(
  host: string,
  remoteDir: string,
  remoteHookVideo: string,
  remoteComposedBody: string,
  remoteOutput: string,
  remoteBanner: string | null,
  hookCaptions: CaptionChunk[],
  hookSegmentStart: number
): Promise<void> {
  // Pick a random B-roll from the remote's synced broll directory
  const brollListStr = await ssh(host, `ls ${REMOTE_BROLL_DIR}/*.mp4 2>/dev/null || ls ${REMOTE_BROLL_DIR}/*.mov 2>/dev/null || echo ""`);
  const brollFiles = brollListStr.split("\n").filter((f) => f.trim());
  if (brollFiles.length === 0) throw new Error("No B-roll clips on remote");
  const remoteBroll = brollFiles[Math.floor(Math.random() * brollFiles.length)];

  const hookDurStr = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -print_format json -show_format ${remoteHookVideo}`);
  const hookDuration = parseFloat(JSON.parse(hookDurStr).format.duration);

  const brollDurStr = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -print_format json -show_format "${remoteBroll}"`);
  const brollDuration = parseFloat(JSON.parse(brollDurStr).format.duration);

  let hookHasAudio = false;
  try {
    const probeOut = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -select_streams a -show_entries stream=codec_type -print_format json ${remoteHookVideo}`);
    hookHasAudio = (JSON.parse(probeOut).streams?.length ?? 0) > 0;
  } catch {}

  const riserExists = await ssh(host, `test -f ${REMOTE_RISER_PATH} && echo yes || echo no`) === "yes";
  const lutExists = await ssh(host, `test -f ${REMOTE_LUT_PATH} && echo yes || echo no`) === "yes";

  const brollStart = brollDuration > hookDuration ? Math.random() * (brollDuration - hookDuration) : 0;

  const rHookOnly = `${remoteDir}/hook_only_tmp.mp4`;

  // Build filter graph for hook composition
  const inputArgs: string[] = [];
  if (brollDuration < hookDuration) inputArgs.push(`-stream_loop -1`);
  inputArgs.push(`-ss ${brollStart.toFixed(2)} -i "${remoteBroll}"`);
  inputArgs.push(`-i ${remoteHookVideo}`);
  if (riserExists) inputArgs.push(`-i ${REMOTE_RISER_PATH}`);

  let bannerIdx = -1;
  if (remoteBanner) {
    bannerIdx = riserExists ? 3 : 2;
    inputArgs.push(`-i ${remoteBanner}`);
  }

  const lutFilter = lutExists ? `,lut3d='${REMOTE_LUT_PATH}'` : "";
  const gradeFilter = `,${COLOR_GRADE_FILTER}`;

  const brollFilter = `[0:v]setsar=1,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}${lutFilter}${gradeFilter},scale=${VIDEO_WIDTH}:${HALF_HEIGHT},pad=${VIDEO_WIDTH}:${HALF_HEIGHT}:-1:-1:black,setpts=PTS-STARTPTS,format=yuv420p[broll]`;
  const headFilter = `[1:v]setsar=1,scale=${VIDEO_WIDTH}:${HALF_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${HALF_HEIGHT}${lutFilter}${gradeFilter},scale=${VIDEO_WIDTH}:${HALF_HEIGHT},pad=${VIDEO_WIDTH}:${HALF_HEIGHT}:-1:-1:black,format=yuv420p[head]`;

  const captionFilter = hookCaptions.length > 0
    ? buildCaptionDrawtext(hookCaptions, hookSegmentStart, REMOTE_FONT_PATH)
    : "";

  const stackFilter = captionFilter
    ? `[broll][head]vstack=inputs=2,${captionFilter}[stacked]`
    : `[broll][head]vstack=inputs=2[stacked]`;

  const bannerFilter = remoteBanner && bannerIdx >= 0
    ? `[stacked][${bannerIdx}:v]overlay=(W-w)/2:(H-h)/2:format=auto[vout]`
    : `[stacked]copy[vout]`;

  let audioFilter: string;
  const riserIdx = riserExists ? 2 : -1;
  if (hookHasAudio && riserExists) {
    audioFilter = `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[ha];[${riserIdx}:a]volume=-12dB,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[ra];[ha][ra]amix=inputs=2:duration=first:normalize=0[aout]`;
  } else if (hookHasAudio) {
    audioFilter = `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`;
  } else if (riserExists) {
    audioFilter = `[${riserIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`;
  } else {
    audioFilter = `anullsrc=r=44100:cl=stereo[aout]`;
  }

  const filterComplex = [brollFilter, headFilter, stackFilter, bannerFilter, audioFilter].join(";");

  let hookCmd = `${REMOTE_FFMPEG_BIN} -y ${inputArgs.join(" ")} -t ${hookDuration.toFixed(2)}`;
  hookCmd += ` -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]"`;
  hookCmd += ` -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -r 30`;
  if (!hookHasAudio && !riserExists) hookCmd += ` -shortest`;
  hookCmd += ` ${rHookOnly}`;

  await ssh(host, hookCmd);

  // Probe body audio for concat
  let bodyHasAudio = false;
  try {
    const probeOut = await ssh(host, `${REMOTE_FFPROBE_BIN} -v quiet -select_streams a -show_entries stream=codec_type -print_format json ${remoteComposedBody}`);
    bodyHasAudio = (JSON.parse(probeOut).streams?.length ?? 0) > 0;
  } catch {}

  // Concat hook + body
  const concatFilter = [
    `[0:v]setpts=PTS-STARTPTS[hv]`,
    `[1:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,setpts=PTS-STARTPTS,format=yuv420p[bv]`,
    bodyHasAudio
      ? `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ba]`
      : `anullsrc=r=44100:cl=stereo[ba]`,
    `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[ha]`,
    `[hv][ha][bv][ba]concat=n=2:v=1:a=1[vfinal][afinal]`,
  ].join(";");

  let concatCmd = `${REMOTE_FFMPEG_BIN} -y -i ${rHookOnly} -i ${remoteComposedBody}`;
  concatCmd += ` -filter_complex "${concatFilter}" -map "[vfinal]" -map "[afinal]"`;
  concatCmd += ` -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -r 30`;
  if (!bodyHasAudio) concatCmd += ` -shortest`;
  concatCmd += ` -movflags +faststart ${remoteOutput}`;

  await ssh(host, concatCmd);

  // Clean up intermediate
  ssh(host, `rm -f ${rHookOnly}`).catch(() => {});
}
