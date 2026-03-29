import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, OUTPUT_DIR } from "./constants";
import {
  detectSilence,
  getVideoDuration,
  segmentsFromSilenceStructured,
  trimSegmentEdges,
  validateBodySegment,
  extractSegment,
  Segment,
} from "./silence-detect";
import { extractAudio, transcribeWithTimestamps, TranscriptWord } from "./transcribe";
import { detectOverlayTimestamps, OverlayDetectionResult } from "./overlay-detect";
import { matchScriptEntry } from "./script-sheet";
import { generateHookTexts } from "./hook-banner";
import { findPriceCard, downloadPriceCardImage } from "./price-lookup";
import { findCarImage, downloadCarImage, closeBrowser as closeCarBrowser } from "./car-image";
import { buildSoldSearchUrl, scrapeEbaySoldListings, closeBrowser as closeEbayBrowser } from "./ebay-scraper";
import { composeBody, OverlayEntry } from "./body-pipeline";
import { processHookWithBody } from "./ffmpeg-pipeline";
import {
  REMOTE_WORKERS,
  checkRemoteAvailable,
  processHookWithBodyRemote,
} from "./remote-ffmpeg";
import { analyzeHookQuality } from "./stumble-detect";
import { captionsForSegment, CaptionChunk } from "./captions";

export type AutoPhase =
  | "uploading"
  | "analyzing"
  | "splitting"
  | "transcribing"
  | "detecting"
  | "fetching_overlays"
  | "composing_body"
  | "generating_hooks"
  | "done"
  | "error";

export interface HookFlag {
  index: number;
  flagged: boolean;
  reason?: string;
}

export interface AutoJobStatus {
  id: string;
  phase: AutoPhase;
  progress: string;
  currentHook: number;
  totalHooks: number;
  outputFiles: string[];
  videoName: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  hookFlags?: HookFlag[];
  // Intermediate data for auto-to-manual editing bridge
  segments?: Segment[];
  transcript?: TranscriptWord[];
  overlayDetection?: OverlayDetectionResult;
  overlaySlots?: { slot: string; filename: string }[];
  hookTexts?: string[];
}

const globalKey = "__auto_pipeline_jobs__" as const;
const globalStore = globalThis as unknown as Record<string, Map<string, AutoJobStatus>>;
if (!globalStore[globalKey]) {
  globalStore[globalKey] = new Map<string, AutoJobStatus>();
}
const autoJobs = globalStore[globalKey];

export function getAutoJob(id: string): AutoJobStatus | undefined {
  return autoJobs.get(id);
}

export function getAllAutoJobs(): AutoJobStatus[] {
  return Array.from(autoJobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function removeAutoJob(id: string): boolean {
  return autoJobs.delete(id);
}

function updateAutoJob(id: string, patch: Partial<AutoJobStatus>) {
  const job = autoJobs.get(id);
  if (job) Object.assign(job, patch);
}

export async function startAutoPipeline(
  rawVideoPath: string,
  jobId: string
): Promise<AutoJobStatus> {
  const job: AutoJobStatus = {
    id: jobId,
    phase: "analyzing",
    progress: "Analyzing audio & transcribing...",
    currentHook: 0,
    totalHooks: 0,
    outputFiles: [],
    videoName: "",
    createdAt: Date.now(),
  };
  autoJobs.set(jobId, job);

  runPipeline(rawVideoPath, jobId).catch((err) => {
    updateAutoJob(jobId, {
      phase: "error",
      error: err.message,
      completedAt: Date.now(),
    });
  });

  return job;
}

async function runPipeline(rawVideoPath: string, jobId: string) {
  const jobDir = path.join(UPLOADS_DIR, jobId);
  const outputDir = path.join(OUTPUT_DIR, jobId);
  await fs.mkdir(outputDir, { recursive: true });

  // ── 1. Concurrent analysis: silence detection + transcription ──
  updateAutoJob(jobId, {
    phase: "analyzing",
    progress: "Analyzing audio & transcribing concurrently...",
  });

  const rawAudioPath = path.join(jobDir, "raw_audio.wav");

  const [, silenceRanges, totalDuration] = await Promise.all([
    extractAudio(rawVideoPath, rawAudioPath),
    detectSilence(rawVideoPath),
    getVideoDuration(rawVideoPath),
  ]);

  console.log(`[auto] Silence detection found ${silenceRanges.length} gaps, video duration: ${totalDuration.toFixed(1)}s`);
  for (const r of silenceRanges) {
    console.log(`[auto]   gap ${r.start.toFixed(2)}s - ${r.end.toFixed(2)}s (${r.duration.toFixed(2)}s)`);
  }

  const transcriptPromise = transcribeWithTimestamps(rawAudioPath);

  // ── 2. Structured segmentation: enforce 3 hooks + 1 body ──
  const rawSegments = segmentsFromSilenceStructured(silenceRanges, totalDuration, 3);

  console.log(`[auto] Structured segments:`);
  for (const s of rawSegments) {
    console.log(`[auto]   ${s.label}: ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s (${(s.end - s.start).toFixed(1)}s)`);
  }

  updateAutoJob(jobId, { progress: "Trimming segment edges..." });
  const trimmedSegments = await trimSegmentEdges(rawVideoPath, rawSegments);

  // ── 3. Await transcription to validate body label ──
  updateAutoJob(jobId, { phase: "transcribing", progress: "Transcribing & validating body..." });

  const transcriptResult = await transcriptPromise;
  const words = transcriptResult.words;

  const segments = validateBodySegment(trimmedSegments, words);

  const hooks = segments.filter((s) => s.label.startsWith("Hook"));
  const bodySegment = segments.find((s) => s.label === "Body");
  if (!bodySegment) throw new Error("No body segment detected in video");

  // Store intermediate data for manual editing bridge
  updateAutoJob(jobId, {
    totalHooks: hooks.length,
    progress: `Found ${hooks.length} hooks + 1 body`,
    segments,
    transcript: words,
  });

  // ── 3b. Stumble detection on hooks ──
  const hookFlags: HookFlag[] = [];
  for (let i = 0; i < hooks.length; i++) {
    const quality = await analyzeHookQuality(words, hooks[i].start, hooks[i].end);
    hookFlags.push({ index: i, flagged: quality.flagged, reason: quality.reason });
    if (quality.flagged) {
      console.log(`[auto] Hook ${i + 1} flagged: ${quality.reason}`);
    }
  }
  updateAutoJob(jobId, { hookFlags });

  // ── 4. Split segments ──
  updateAutoJob(jobId, { phase: "splitting", progress: "Extracting segments..." });

  for (const seg of segments) {
    const filename = seg.label === "Body"
      ? "body_segment.mp4"
      : `hook_${seg.index}.mp4`;
    await extractSegment(rawVideoPath, seg.start, seg.end, path.join(jobDir, filename));
  }

  // ── 5. Detect overlay timestamps ──
  updateAutoJob(jobId, { phase: "detecting", progress: "Detecting overlay timestamps..." });

  const detection: OverlayDetectionResult = await detectOverlayTimestamps(words);

  const scriptMatch = matchScriptEntry(detection.car?.text, detection.part?.text);
  if (scriptMatch) {
    const correctedCar = [scriptMatch.year, scriptMatch.make, scriptMatch.model]
      .filter(Boolean)
      .join(" ");
    if (detection.car) {
      detection.car = { ...detection.car, text: correctedCar };
    } else {
      detection.car = { text: correctedCar, start: 0, end: 0 };
    }
    if (detection.part) {
      detection.part = { ...detection.part, text: scriptMatch.part };
    } else {
      detection.part = { text: scriptMatch.part, start: 0, end: 0 };
    }
    console.log(`[auto] Script sheet corrected → car: "${correctedCar}", part: "${scriptMatch.part}"`);
  }

  const videoBaseName = [detection.car?.text, detection.part?.text]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim() || "Video";

  updateAutoJob(jobId, { videoName: videoBaseName, overlayDetection: detection });

  // ── 6. Fetch overlay images in parallel ──
  const bodyOffset = bodySegment.start;
  const toBodyRelative = (rawTs: number) => Math.max(0, rawTs - bodyOffset);

  updateAutoJob(jobId, { phase: "fetching_overlays", progress: "Fetching overlay images..." });

  const overlayEntries: OverlayEntry[] = [];
  const overlayFetches: Promise<void>[] = [];
  const overlaySlots: { slot: string; filename: string }[] = [];

  if (detection.part?.text) {
    overlayFetches.push(
      (async () => {
        try {
          const match = await findPriceCard(detection.part!.text);
          if (match && match.image_url) {
            const dest = path.join(jobDir, "auto_price.jpg");
            await downloadPriceCardImage(match.image_url, dest);
            overlayEntries.push({
              slot: "price",
              imagePath: dest,
              timestamp: toBodyRelative(detection.price?.start ?? detection.part!.start),
            });
            overlaySlots.push({ slot: "price", filename: "auto_price.jpg" });
          }
        } catch (e: any) {
          console.log(`[auto] Price card fetch failed: ${e.message}`);
        }
      })()
    );
  }

  if (detection.car?.text) {
    overlayFetches.push(
      (async () => {
        try {
          const result = await findCarImage(detection.car!.text);
          if (result) {
            const dest = path.join(jobDir, "auto_car.jpg");
            await downloadCarImage(result.imageUrl, dest, (result as any)._candidates);
            overlayEntries.push({
              slot: "car",
              imagePath: dest,
              timestamp: toBodyRelative(detection.car!.start),
            });
            overlaySlots.push({ slot: "car", filename: "auto_car.jpg" });
          }
        } catch (e: any) {
          console.log(`[auto] Car image fetch failed: ${e.message}`);
        } finally {
          await closeCarBrowser();
        }
      })()
    );
  }

  if (detection.part?.text && detection.car?.text) {
    overlayFetches.push(
      (async () => {
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
            overlayEntries.push({
              slot: "part",
              imagePath: partDest,
              timestamp: toBodyRelative(detection.part!.start),
            });
            overlaySlots.push({ slot: "part", filename: "auto_part.jpg" });
          }
          if (result.soldScreenshotSaved && detection.soldPrice) {
            overlayEntries.push({
              slot: "soldPrice",
              imagePath: soldDest,
              timestamp: toBodyRelative(detection.soldPrice.start),
            });
            overlaySlots.push({ slot: "soldPrice", filename: "auto_sold.png" });
          }
        } catch (e: any) {
          console.log(`[auto] eBay fetch failed: ${e.message}`);
        } finally {
          await closeEbayBrowser();
        }
      })()
    );
  }

  await Promise.all(overlayFetches);

  updateAutoJob(jobId, {
    progress: `Got ${overlayEntries.length} overlay images`,
    overlaySlots,
  });

  // ── 7. Compose body with overlays + captions ──
  updateAutoJob(jobId, { phase: "composing_body", progress: "Composing body with overlays & captions..." });

  const bodyCaptions = await captionsForSegment(words, bodySegment.start, bodySegment.end);

  const bodyVideoPath = path.join(jobDir, "body_segment.mp4");
  const composedBodyPath = path.join(jobDir, "body_composed.mp4");
  await composeBody(bodyVideoPath, overlayEntries, composedBodyPath, bodyCaptions, bodySegment.start);

  // ── 8. Generate hook texts ──
  const hookTexts = await generateHookTexts(hooks.length, {
    partName: detection.part?.text,
    carName: detection.car?.text,
    yardPrice: detection.price?.text,
    soldPrice: detection.soldPrice?.text,
  });

  updateAutoJob(jobId, { hookTexts });

  // ── 9. Generate per-hook captions ──
  const hookCaptionSets: CaptionChunk[][] = [];
  for (const hook of hooks) {
    const captions = await captionsForSegment(words, hook.start, hook.end);
    hookCaptionSets.push(captions);
  }

  // ── 10. Process hooks (distributed across workers) ──
  updateAutoJob(jobId, { phase: "generating_hooks", progress: "Rendering final videos..." });

  const availableRemotes: string[] = [];
  const checks = await Promise.all(
    REMOTE_WORKERS.map(async (w) => ({
      host: w.host,
      ok: await checkRemoteAvailable(w.host),
    }))
  );
  for (const c of checks) {
    if (c.ok) availableRemotes.push(c.host);
  }

  type Worker = { type: "local" } | { type: "remote"; host: string };
  const workers: Worker[] = [{ type: "local" }];
  for (const host of availableRemotes) {
    workers.push({ type: "remote", host });
  }

  const hookFiles = (await fs.readdir(jobDir))
    .filter((f) => /^hook_\d+\.mp4$/.test(f))
    .sort((a, b) => {
      const ai = parseInt(a.match(/\d+/)![0]);
      const bi = parseInt(b.match(/\d+/)![0]);
      return ai - bi;
    });

  let completed = 0;
  const pending = hookFiles.map((file, idx) => ({ file, idx }));
  const outputFiles: string[] = [];

  const safeName = videoBaseName.replace(/[/\\?%*:|"<>]/g, "").trim();

  const processNext = async (worker: Worker): Promise<void> => {
    while (pending.length > 0) {
      const item = pending.shift();
      if (!item) return;
      const { file, idx } = item;
      const hookPath = path.join(jobDir, file);
      const outputFile = `${safeName} - ${idx + 1}.mp4`;
      const outputPath = path.join(outputDir, outputFile);
      const hookText = hookTexts[idx] || undefined;
      const hookCaptions = hookCaptionSets[idx] || undefined;
      const hook = hooks[idx];

      try {
        if (worker.type === "remote") {
          await processHookWithBodyRemote(hookPath, composedBodyPath, outputPath, worker.host, hookText, hookCaptions, hook?.start);
        } else {
          await processHookWithBody(hookPath, composedBodyPath, outputPath, hookText, hookCaptions, hook?.start);
        }
      } catch (err: any) {
        if (worker.type === "remote") {
          await processHookWithBody(hookPath, composedBodyPath, outputPath, hookText, hookCaptions, hook?.start);
        } else {
          throw err;
        }
      }

      outputFiles.push(outputFile);
      completed++;
      updateAutoJob(jobId, {
        currentHook: completed,
        progress: `Rendered ${completed}/${hookFiles.length} videos`,
      });
    }
  };

  await Promise.all(workers.map((w) => processNext(w)));

  await fs.unlink(rawAudioPath).catch(() => {});

  updateAutoJob(jobId, {
    phase: "done",
    progress: `${outputFiles.length} videos ready`,
    outputFiles,
    completedAt: Date.now(),
  });
}
