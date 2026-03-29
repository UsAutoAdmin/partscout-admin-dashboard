/**
 * Shared types for the video generation pipeline.
 * Extracted to avoid circular imports between auto-pipeline and remote-pipeline.
 */

import type { Segment } from "./silence-detect";
import type { TranscriptWord } from "./transcribe";
import type { OverlayDetectionResult } from "./overlay-detect";

export type AutoPhase =
  | "queued"
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
  segments?: Segment[];
  transcript?: TranscriptWord[];
  overlayDetection?: OverlayDetectionResult;
  overlaySlots?: { slot: string; filename: string }[];
  hookTexts?: string[];
}
