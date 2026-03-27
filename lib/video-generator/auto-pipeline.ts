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
} from "./silence-detect";
import { extractAudio, transcribeWithTimestamps } from "./transcribe";
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

  // Keep silence detection sensitive (0.8s) — the structured segmentation
  // picks only the top 3 longest gaps, naturally ignoring short pauses
  const [, silenceRanges, totalDuration] = await Promise.all([
    extractAudio(rawVideoPath, rawAudioPath),
    detectSilence(rawVideoPath),
    getVideoDuration(rawVideoPath),
  ]);

  console.log(`[auto] Silence detection found ${silenceRanges.length} gaps, video duration: ${totalDuration.toFixed(1)}s`);
  for (const r of silenceRanges) {
    console.log(`[auto]   gap ${r.start.toFixed(2)}s - ${r.end.toFixed(2)}s (${r.duration.toFixed(2)}s)`);
  }

  // Start transcription of full audio concurrently (don't await yet)
  const transcriptPromise = transcribeWithTimestamps(rawAudioPath);

  // ── 2. Structured segmentation: enforce 3 hooks + 1 body ──
  const rawSegments = segmentsFromSilenceStructured(silenceRanges, totalDuration, 3);

  console.log(`[auto] Structured segments:`);
  for (const s of rawSegments) {
    console.log(`[auto]   ${s.label}: ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s (${(s.end - s.start).toFixed(1)}s)`);
  }

  // Trim segment edges to actual speech onset
  updateAutoJob(jobId, { progress: "Trimming segment edges..." });
  const trimmedSegments = await trimSegmentEdges(rawVideoPath, rawSegments);

  // ── 3. Await transcription to validate body label ──
  updateAutoJob(jobId, { phase: "transcribing", progress: "Transcribing & validating body..." });

  const transcriptResult = await transcriptPromise;
  const words = transcriptResult.words;

  // Use transcript to confirm which segment is actually the body
  const segments = validateBodySegment(trimmedSegments, words);

  const hooks = segments.filter((s) => s.label.startsWith("Hook"));
  const bodySegment = segments.find((s) => s.label === "Body");
  if (!bodySegment) throw new Error("No body segment detected in video");

  updateAutoJob(jobId, {
    totalHooks: hooks.length,
    progress: `Found ${hooks.length} hooks + 1 body`,
  });

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

  // Cross-reference with script sheet to correct transcription errors
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

  // Build descriptive video name from detected (or corrected) car + part
  const videoBaseName = [detection.car?.text, detection.part?.text]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim() || "Video";

  updateAutoJob(jobId, { videoName: videoBaseName });

  // ── 6. Fetch overlay images in parallel ──
  // Timestamps from detection are raw-video-relative; convert to body-relative
  const bodyOffset = bodySegment.start;
  const toBodyRelative = (rawTs: number) => Math.max(0, rawTs - bodyOffset);

  updateAutoJob(jobId, { phase: "fetching_overlays", progress: "Fetching overlay images..." });

  const overlayEntries: OverlayEntry[] = [];
  const overlayFetches: Promise<void>[] = [];

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

          // Parse numeric price from transcript (e.g. "$80" → 80, "forty five dollars" → 45)
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
          }
          if (result.soldScreenshotSaved && detection.soldPrice) {
            overlayEntries.push({
              slot: "soldPrice",
              imagePath: soldDest,
              timestamp: toBodyRelative(detection.soldPrice.start),
            });
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
  });

  // ── 7. Compose body with overlays ──
  updateAutoJob(jobId, { phase: "composing_body", progress: "Composing body with overlays..." });

  const bodyVideoPath = path.join(jobDir, "body_segment.mp4");
  const composedBodyPath = path.join(jobDir, "body_composed.mp4");
  await composeBody(bodyVideoPath, overlayEntries, composedBodyPath);

  // ── 8. Generate hook texts ──
  const hookTexts = await generateHookTexts(hooks.length, {
    partName: detection.part?.text,
    carName: detection.car?.text,
    yardPrice: detection.price?.text,
    soldPrice: detection.soldPrice?.text,
  });

  // ── 9. Process hooks (distributed across workers) ──
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

  // Sanitize for filesystem
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

      try {
        if (worker.type === "remote") {
          await processHookWithBodyRemote(hookPath, composedBodyPath, outputPath, worker.host, hookText);
        } else {
          await processHookWithBody(hookPath, composedBodyPath, outputPath, hookText);
        }
      } catch (err: any) {
        if (worker.type === "remote") {
          await processHookWithBody(hookPath, composedBodyPath, outputPath, hookText);
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

  // Clean up temporary audio file
  await fs.unlink(rawAudioPath).catch(() => {});

  updateAutoJob(jobId, {
    phase: "done",
    progress: `${outputFiles.length} videos ready`,
    outputFiles,
    completedAt: Date.now(),
  });
}
