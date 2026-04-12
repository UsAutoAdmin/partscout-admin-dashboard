"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BrollFile {
  name: string;
  sizeMb: number;
  modified: string;
}

interface Segment {
  index: number;
  start: number;
  end: number;
  label: string;
}

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

interface OverlayTimestamp {
  text: string;
  start: number;
  end: number;
}

interface OverlayDetection {
  part: OverlayTimestamp | null;
  car: OverlayTimestamp | null;
  price: OverlayTimestamp | null;
  soldPrice: OverlayTimestamp | null;
}

interface OverlaySlot {
  key: "part" | "car" | "price" | "soldPrice";
  label: string;
  detection: OverlayTimestamp | null;
  file: File | null;
  uploadedFilename: string | null;
}

interface HookResult {
  hookIndex: number;
  hookText: string;
  brollFile: string;
  outputFile: string;
}

interface JobStatus {
  id: string;
  phase: "queued" | "processing" | "done" | "error";
  currentHook: number;
  totalHooks: number;
  hookResults: HookResult[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

type WorkflowPhase =
  | "upload"
  | "analyzing"
  | "segments"
  | "splitting"
  | "transcribing"
  | "detecting"
  | "overlays"
  | "hookTexts"
  | "generating"
  | "done"
  | "error";

type ProcessingMode = "manual" | "auto";

interface HookFlag {
  index: number;
  flagged: boolean;
  reason?: string;
}

interface AutoJobStatus {
  id: string;
  phase: string;
  progress: string;
  currentHook: number;
  totalHooks: number;
  outputFiles: string[];
  videoName: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  hookFlags?: HookFlag[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.round((secs % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function VideoDropZone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(mp4|mov|mkv|avi|webm)$/i.test(f.name)
      );
      if (dropped.length > 0) onFile(dropped[0]);
    },
    [onFile]
  );

  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
        dragging
          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10"
          : file
          ? "border-success-400/30 dark:border-success-500/30 bg-success-50 dark:bg-success-500/5"
          : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-gray-600"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {!file ? (
        <>
          <div className="flex justify-center mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                className="text-gray-400"
              >
                <path
                  d="M12 16V8m0 0l-4 4m4-4l4 4M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Drop your raw recording
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Single video containing all hooks + body
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Drag & drop or click to browse
          </p>
        </>
      ) : (
        <div>
          <p className="text-sm font-semibold text-success-600 dark:text-success-400">
            {file.name}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
      )}
    </div>
  );
}

function SegmentEditor({
  segments,
  totalDuration,
  videoUrl,
  onConfirm,
}: {
  segments: Segment[];
  totalDuration: number;
  videoUrl: string;
  onConfirm: (segs: Segment[]) => void;
}) {
  const [editedSegments, setEditedSegments] = useState<Segment[]>(segments);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const isScrubbing = useRef(false);
  const isDraggingEdge = useRef(false);
  const segmentsRef = useRef(editedSegments);
  segmentsRef.current = editedSegments;

  // Stable random waveform heights (computed once, not on every render)
  const [waveformHeights] = useState(() =>
    Array.from({ length: 400 }, (_, i) =>
      20 + Math.sin(i * 0.7) * 15 + Math.abs(Math.sin(i * 1.3)) * 30
    )
  );

  // High-frequency time sync using requestAnimationFrame
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncTime = () => {
      setCurrentTime(video.currentTime);
      rafRef.current = requestAnimationFrame(syncTime);
    };

    const onPlay = () => {
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(syncTime);
    };
    const onPause = () => {
      setIsPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    const onSeeked = () => setCurrentTime(video.currentTime);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onSeeked);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onSeeked);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Auto-scroll to keep playhead in view during playback
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const totalWidth = zoom * 100;
    const playheadPx = (currentTime / totalDuration) * (totalWidth / 100) * container.clientWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;

    if (playheadPx < visibleLeft + 40 || playheadPx > visibleRight - 40) {
      container.scrollLeft = playheadPx - container.clientWidth * 0.3;
    }
  }, [currentTime, isPlaying, zoom, totalDuration]);

  function seekTo(time: number) {
    const clamped = Math.max(0, Math.min(totalDuration, time));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  }

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function stepFrame(direction: -1 | 1) {
    seekTo(currentTime + direction * (1 / 30));
  }

  function updateSegment(index: number, patch: Partial<Segment>) {
    setEditedSegments((prev) =>
      prev.map((s) => (s.index === index ? { ...s, ...patch } : s))
    );
  }

  function deleteSegment(index: number) {
    setEditedSegments((prev) => {
      const filtered = prev.filter((s) => s.index !== index);
      return reindexSegments(filtered);
    });
    setSelectedIdx(null);
  }

  function addSegmentAtPlayhead() {
    const t = currentTime;
    const hitSeg = editedSegments.find(
      (s) => t > s.start + 0.05 && t < s.end - 0.05
    );
    if (!hitSeg) return;

    setEditedSegments((prev) => {
      const result: Segment[] = [];
      for (const s of prev) {
        if (s.index === hitSeg.index) {
          result.push({ ...s, end: t });
          const nextHookNum =
            prev.filter((x) => x.label.startsWith("Hook")).length + 1;
          result.push({
            index: 0,
            start: t,
            end: s.end,
            label: `Hook ${nextHookNum}`,
          });
        } else {
          result.push(s);
        }
      }
      return reindexSegments(result);
    });
  }

  function reindexSegments(segs: Segment[]): Segment[] {
    return segs
      .sort((a, b) => a.start - b.start)
      .map((s, i) => ({ ...s, index: i }));
  }

  function autoRelabel() {
    setEditedSegments((prev) => {
      const sorted = [...prev].sort((a, b) => a.start - b.start);
      let hookNum = 1;
      return sorted.map((s, i) => {
        if (i === sorted.length - 1) return { ...s, label: "Body" };
        return { ...s, label: `Hook ${hookNum++}` };
      });
    });
  }

  // Convert pixel X position to time, accounting for zoom + scroll
  function pxToTime(clientX: number): number {
    if (!scrollContainerRef.current) return 0;
    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const relX = clientX - rect.left + container.scrollLeft;
    const totalWidthPx = container.scrollWidth;
    return (relX / totalWidthPx) * totalDuration;
  }

  // Drag: segment edges
  function handleSegmentEdgeDrag(
    e: React.MouseEvent,
    segIdx: number,
    edge: "start" | "end"
  ) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingEdge.current = true;
    const seg = editedSegments.find((s) => s.index === segIdx);
    if (!seg) return;

    const onMove = (ev: MouseEvent) => {
      const newTime = Math.max(0, Math.min(totalDuration, pxToTime(ev.clientX)));
      const latestSeg = segmentsRef.current.find((s) => s.index === segIdx);
      if (!latestSeg) return;

      if (edge === "start") {
        if (newTime >= latestSeg.end - 0.05) return;
        updateSegment(segIdx, { start: newTime });
      } else {
        if (newTime <= latestSeg.start + 0.05) return;
        updateSegment(segIdx, { end: newTime });
      }
      seekTo(newTime);
    };

    const onUp = () => {
      isDraggingEdge.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Timeline scrub: click anywhere to jump playhead, hold + drag to scrub
  function handleTimelineMouseDown(e: React.MouseEvent) {
    if (isDraggingEdge.current) return;
    e.preventDefault();
    isScrubbing.current = true;

    const video = videoRef.current;
    if (video && !video.paused) video.pause();

    seekTo(pxToTime(e.clientX));

    const onMove = (ev: MouseEvent) => {
      if (!isScrubbing.current) return;
      seekTo(pxToTime(ev.clientX));
    };
    const onUp = () => {
      isScrubbing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Pinch-to-zoom via Ctrl+Scroll / trackpad
  function handleWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.3 : 0.3;
      setZoom((prev) => Math.max(1, Math.min(50, prev + delta * prev * 0.1)));
    }
  }

  // Ruler tick generation based on zoom
  function getRulerTicks(): { time: number; major: boolean }[] {
    const ticks: { time: number; major: boolean }[] = [];
    let step: number;
    if (zoom >= 20) step = 0.1;
    else if (zoom >= 10) step = 0.25;
    else if (zoom >= 5) step = 0.5;
    else if (zoom >= 2) step = 1;
    else step = 2;

    const majorEvery = step <= 0.25 ? 4 : step <= 1 ? 5 : 3;
    let tickIdx = 0;
    for (let t = 0; t <= totalDuration + step * 0.5; t += step) {
      if (t > totalDuration) break;
      ticks.push({ time: t, major: tickIdx % majorEvery === 0 });
      tickIdx++;
    }
    return ticks;
  }

  const labelOptions = [
    ...Array.from({ length: 10 }, (_, i) => `Hook ${i + 1}`),
    "Body",
    "Discard",
  ];

  const selectedSeg =
    selectedIdx !== null
      ? editedSegments.find((s) => s.index === selectedIdx)
      : null;

  const timeToPercent = (t: number) => (t / totalDuration) * 100;

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[400px] bg-black"
        />
      </div>

      {/* Transport controls */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          {/* Left: playback controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => seekTo(0)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Go to start"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-600 dark:text-gray-400">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button
              onClick={() => stepFrame(-1)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Previous frame"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-600 dark:text-gray-400">
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              onClick={togglePlayPause}
              className="rounded-xl bg-gray-900 dark:bg-white p-2.5 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white dark:text-black">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white dark:text-black">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => stepFrame(1)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Next frame"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-600 dark:text-gray-400">
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
              </svg>
            </button>
            <button
              onClick={() => seekTo(totalDuration)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Go to end"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-600 dark:text-gray-400">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

            <span className="text-sm font-mono text-gray-700 dark:text-gray-300 tabular-nums min-w-[80px]">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-gray-400">/</span>
            <span className="text-xs font-mono text-gray-400 tabular-nums">
              {formatTime(totalDuration)}
            </span>
          </div>

          {/* Center: action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={addSegmentAtPlayhead}
              className="flex items-center gap-1 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 px-2.5 py-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors"
              title="Split segment at playhead"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Split
            </button>
            <button
              onClick={autoRelabel}
              className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Auto-Label
            </button>
          </div>

          {/* Right: zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Zoom out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35M8 11h6" />
              </svg>
            </button>
            <input
              type="range"
              min="1"
              max="50"
              step="0.5"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-1 accent-brand-500 cursor-pointer"
              title={`Zoom: ${zoom.toFixed(1)}x`}
            />
            <button
              onClick={() => setZoom((z) => Math.min(50, z * 1.5))}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Zoom in"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
              </svg>
            </button>
            <span className="text-[10px] font-mono text-gray-400 w-8 text-right">
              {zoom.toFixed(1)}x
            </span>
            {zoom > 1 && (
              <button
                onClick={() => setZoom(1)}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Fit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CapCut-style Zoomable Timeline */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-950 dark:bg-gray-950 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto overflow-y-hidden"
          onWheel={handleWheel}
        >
          <div
            style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
            className="relative"
          >
            {/* Ruler */}
            <div className="relative h-6 border-b border-gray-800 select-none">
              {getRulerTicks().map(({ time, major }) => {
                const pct = timeToPercent(time);
                return (
                  <div
                    key={time}
                    className="absolute top-0 flex flex-col items-center"
                    style={{ left: `${pct}%` }}
                  >
                    <div
                      className={`w-px ${
                        major ? "h-3 bg-gray-500" : "h-2 bg-gray-700"
                      }`}
                    />
                    {major && (
                      <span className="text-[9px] font-mono text-gray-500 mt-0.5 -translate-x-1/2 whitespace-nowrap">
                        {formatTime(time)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Track area — mousedown anywhere to scrub */}
            <div
              ref={timelineRef}
              className="relative h-20 cursor-crosshair select-none"
              onMouseDown={handleTimelineMouseDown}
            >
              {/* Waveform */}
              <div className="absolute inset-0 overflow-hidden">
                {waveformHeights.map((h, i) => {
                  const pct = (i / waveformHeights.length) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute bottom-0 bg-gray-800 rounded-t-sm"
                      style={{
                        left: `${pct}%`,
                        width: `${100 / waveformHeights.length}%`,
                        height: `${h}%`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Segment blocks */}
              {editedSegments.map((seg) => {
                const leftPct = timeToPercent(seg.start);
                const widthPct = timeToPercent(seg.end) - leftPct;
                const isBody = seg.label === "Body";
                const isDiscard = seg.label === "Discard";
                const isSelected = selectedIdx === seg.index;

                const borderColor = isDiscard
                  ? "border-gray-500"
                  : isBody
                  ? "border-purple-500"
                  : "border-sky-400";

                const bgColor = isDiscard
                  ? "bg-gray-500/15"
                  : isBody
                  ? "bg-purple-500/15"
                  : "bg-sky-400/15";

                return (
                  <div
                    key={seg.index}
                    className={`absolute top-1.5 bottom-1.5 rounded border-2 ${borderColor} ${bgColor} ${
                      isSelected ? "ring-1 ring-white/40" : ""
                    } group`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.2)}%`,
                    }}
                    onClick={() => setSelectedIdx(seg.index)}
                  >
                    {/* Left handle */}
                    <div
                      className="absolute -left-[5px] top-0 bottom-0 w-[10px] cursor-col-resize z-10 flex items-center justify-center"
                      onMouseDown={(e) =>
                        handleSegmentEdgeDrag(e, seg.index, "start")
                      }
                    >
                      <div
                        className={`w-[3px] h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                          isDiscard
                            ? "bg-gray-400"
                            : isBody
                            ? "bg-purple-400"
                            : "bg-sky-300"
                        }`}
                      />
                    </div>

                    {/* Right handle */}
                    <div
                      className="absolute -right-[5px] top-0 bottom-0 w-[10px] cursor-col-resize z-10 flex items-center justify-center"
                      onMouseDown={(e) =>
                        handleSegmentEdgeDrag(e, seg.index, "end")
                      }
                    >
                      <div
                        className={`w-[3px] h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
                          isDiscard
                            ? "bg-gray-400"
                            : isBody
                            ? "bg-purple-400"
                            : "bg-sky-300"
                        }`}
                      />
                    </div>

                    {/* Label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span
                        className={`text-[10px] font-bold tracking-wide whitespace-nowrap ${
                          isDiscard
                            ? "text-gray-400"
                            : isBody
                            ? "text-purple-300"
                            : "text-sky-300"
                        }`}
                      >
                        {seg.label}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Playhead indicator */}
              <div
                className="absolute top-0 bottom-0 z-30 pointer-events-none"
                style={{
                  left: `${timeToPercent(currentTime)}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-red-500" />
                <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-3 h-3 bg-red-500 rounded-sm rotate-45" />
              </div>
            </div>
          </div>
        </div>

        {/* Zoom hint */}
        <div className="flex items-center justify-center py-1.5 border-t border-gray-800">
          <span className="text-[10px] text-gray-600">
            Ctrl+Scroll to zoom &middot; Drag playhead to scrub &middot; Drag
            segment edges to trim
          </span>
        </div>
      </div>

      {/* Selected segment detail panel */}
      {selectedSeg && (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">
              Editing: {selectedSeg.label}
            </h4>
            <button
              onClick={() => deleteSegment(selectedSeg.index)}
              className="flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12z" />
              </svg>
              Delete
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                Label
              </label>
              <select
                value={selectedSeg.label}
                onChange={(e) =>
                  updateSegment(selectedSeg.index, { label: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {labelOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                Start
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(selectedSeg.start)}
                </span>
                <button
                  onClick={() => seekTo(selectedSeg.start)}
                  className="rounded bg-gray-100 dark:bg-gray-800 p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Seek to start"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-gray-500"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                End
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  {formatTime(selectedSeg.end)}
                </span>
                <button
                  onClick={() => seekTo(selectedSeg.end)}
                  className="rounded bg-gray-100 dark:bg-gray-800 p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Seek to end"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-gray-500"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Duration: {(selectedSeg.end - selectedSeg.start).toFixed(1)}s
          </p>
        </div>
      )}

      {/* Segment list (compact) */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">
            Segments ({editedSegments.length})
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Click a segment to select. Drag edges to trim. Use Split to divide.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {editedSegments
            .sort((a, b) => a.start - b.start)
            .map((seg) => {
              const isBody = seg.label === "Body";
              const isDiscard = seg.label === "Discard";
              return (
                <div
                  key={seg.index}
                  className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
                    selectedIdx === seg.index
                      ? "bg-sky-50 dark:bg-sky-500/5"
                      : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  }`}
                  onClick={() => {
                    setSelectedIdx(seg.index);
                    seekTo(seg.start);
                  }}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isDiscard
                        ? "bg-gray-400"
                        : isBody
                        ? "bg-purple-500"
                        : "bg-sky-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white/90 w-20">
                    {seg.label}
                  </span>
                  <span className="text-xs font-mono text-gray-500">
                    {formatTime(seg.start)} &ndash; {formatTime(seg.end)}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {(seg.end - seg.start).toFixed(1)}s
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <button
        onClick={() => onConfirm(editedSegments)}
        className="w-full rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-white shadow-theme-sm hover:bg-brand-600 transition-colors"
      >
        Confirm Segments & Continue
      </button>
    </div>
  );
}

function OverlayPanel({
  detection,
  onAllUploaded,
  jobId,
}: {
  detection: OverlayDetection;
  onAllUploaded: (slots: OverlaySlot[]) => void;
  jobId: string;
}) {
  const [slots, setSlots] = useState<OverlaySlot[]>([
    {
      key: "part",
      label: "Part Photo",
      detection: detection.part,
      file: null,
      uploadedFilename: null,
    },
    {
      key: "car",
      label: "Car Photo",
      detection: detection.car,
      file: null,
      uploadedFilename: null,
    },
    {
      key: "price",
      label: "Yard Price Screenshot",
      detection: detection.price,
      file: null,
      uploadedFilename: null,
    },
    {
      key: "soldPrice",
      label: "Sold Listing Screenshot",
      detection: detection.soldPrice,
      file: null,
      uploadedFilename: null,
    },
  ]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<Record<string, string>>({});
  const autoFetchedRef = useRef(false);

  useEffect(() => {
    if (autoFetchedRef.current) return;
    autoFetchedRef.current = true;

    const partName = detection.part?.text;
    const carName = detection.car?.text;

    const jobs: Promise<void>[] = [];

    if (partName) {
      jobs.push(
        (async () => {
          setAutoStatus((p) => ({ ...p, price: "Looking up price card..." }));
          try {
            const res = await fetch("/api/video-generator/auto-overlay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, partName }),
            });
            const data = await res.json();
            if (data.matched && data.filename) {
              setSlots((prev) =>
                prev.map((s) =>
                  s.key === "price"
                    ? { ...s, uploadedFilename: data.filename }
                    : s
                )
              );
              setAutoStatus((p) => ({
                ...p,
                price: `Price card: "${data.matchedPart}" ($${data.price})`,
              }));
            } else {
              setAutoStatus((p) => ({
                ...p,
                price: `No price card for "${partName}" — upload manually`,
              }));
            }
          } catch {
            setAutoStatus((p) => ({ ...p, price: "Price lookup failed" }));
          }
        })()
      );
    }

    if (carName) {
      jobs.push(
        (async () => {
          setAutoStatus((p) => ({ ...p, car: "Finding car photo..." }));
          try {
            const res = await fetch("/api/video-generator/auto-car-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, carDescription: carName }),
            });
            const data = await res.json();
            if (data.found && data.filename) {
              setSlots((prev) =>
                prev.map((s) =>
                  s.key === "car"
                    ? { ...s, uploadedFilename: data.filename }
                    : s
                )
              );
              setAutoStatus((p) => ({
                ...p,
                car: `Car photo: ${data.searchTerm}`,
              }));
            } else {
              setAutoStatus((p) => ({
                ...p,
                car: `No car photo for "${carName}" — upload manually`,
              }));
            }
          } catch {
            setAutoStatus((p) => ({ ...p, car: "Car photo lookup failed" }));
          }
        })()
      );
    }

    if (partName && carName) {
      jobs.push(
        (async () => {
          setAutoStatus((p) => ({
            ...p,
            part: "Finding eBay part photo...",
            soldPrice: "Finding sold listings...",
          }));
          try {
            const res = await fetch("/api/video-generator/auto-ebay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId, partName, carDescription: carName, soldPriceText: detection.soldPrice?.text }),
            });
            const data = await res.json();

            if (data.partImage) {
              setSlots((prev) =>
                prev.map((s) =>
                  s.key === "part"
                    ? { ...s, uploadedFilename: data.partImage.filename }
                    : s
                )
              );
              setAutoStatus((p) => ({
                ...p,
                part: `Part photo: ${data.partImage.title.slice(0, 50)}`,
              }));
            } else {
              setAutoStatus((p) => ({
                ...p,
                part: "No eBay part photo found — upload manually",
              }));
            }

            if (data.soldCard) {
              setSlots((prev) =>
                prev.map((s) =>
                  s.key === "soldPrice"
                    ? { ...s, uploadedFilename: data.soldCard.filename }
                    : s
                )
              );
              const count = data.soldCard.listingsUsed.length;
              setAutoStatus((p) => ({
                ...p,
                soldPrice: `Sold listing card (${count} listings)`,
              }));
            } else {
              setAutoStatus((p) => ({
                ...p,
                soldPrice: "No sold listings found — upload manually",
              }));
            }
          } catch {
            setAutoStatus((p) => ({
              ...p,
              part: "eBay lookup failed",
              soldPrice: "eBay lookup failed",
            }));
          }
        })()
      );
    }

    Promise.all(jobs);
  }, [detection, jobId]);

  async function handleFile(slotKey: string, file: File) {
    setUploading(slotKey);
    try {
      const formData = new FormData();
      formData.append("jobId", jobId);
      formData.append("slot", slotKey);
      formData.append("image", file);

      const res = await fetch("/api/video-generator/upload-overlay", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setSlots((prev) =>
        prev.map((s) =>
          s.key === slotKey
            ? { ...s, file, uploadedFilename: data.filename }
            : s
        )
      );
    } catch (err: any) {
      console.error("Upload failed:", err);
    }
    setUploading(null);
  }

  const allFilled = slots.every((s) => s.uploadedFilename);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-1">
          Overlay Images
        </h4>
        <p className="text-xs text-gray-500 mb-2">
          Drag and drop an image into each slot. These will appear in the top
          half of the body section at the detected timestamps.
        </p>
        {Object.keys(autoStatus).length > 0 && (
          <div className="flex flex-col gap-1 mb-3">
            {Object.entries(autoStatus).map(([key, msg]) => (
              <p
                key={key}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-500/5 border border-brand-200 dark:border-brand-500/20 text-brand-700 dark:text-brand-300"
              >
                {msg}
              </p>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {slots.map((slot) => (
            <ImageDropZone
              key={slot.key}
              slot={slot}
              isUploading={uploading === slot.key}
              onFile={(f) => handleFile(slot.key, f)}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => onAllUploaded(slots)}
        disabled={!allFilled}
        className="w-full rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-white shadow-theme-sm hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {allFilled ? "Generate Videos" : "Upload all 4 images to continue"}
      </button>
    </div>
  );
}

function ImageDropZone({
  slot,
  isUploading,
  onFile,
}: {
  slot: OverlaySlot;
  isUploading: boolean;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (slot.file) {
      const url = URL.createObjectURL(slot.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [slot.file]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name)
      );
      if (dropped.length > 0) onFile(dropped[0]);
    },
    [onFile]
  );

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed p-4 text-center transition-colors cursor-pointer aspect-square flex flex-col items-center justify-center ${
        dragging
          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10"
          : slot.uploadedFilename
          ? "border-success-400/30 dark:border-success-500/30 bg-success-50 dark:bg-success-500/5"
          : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-gray-600"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {isUploading ? (
        <div className="animate-pulse">
          <p className="text-xs font-medium text-gray-500">Uploading...</p>
        </div>
      ) : previewUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={slot.label}
            className="max-h-[80%] max-w-full object-contain rounded-lg"
          />
          <p className="text-[10px] font-medium text-success-600 dark:text-success-400 truncate w-full">
            {slot.file?.name}
          </p>
        </div>
      ) : (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 mb-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-gray-400"
            >
              <path
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {slot.label}
          </p>
          {slot.detection && (
            <p className="text-[10px] text-gray-400 mt-1">
              &ldquo;{slot.detection.text}&rdquo; at{" "}
              {formatTime(slot.detection.start)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Processing hook {current} of {total}
        </span>
        <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
          {pct}%
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: WorkflowPhase }) {
  const phases: { key: WorkflowPhase[]; label: string }[] = [
    { key: ["upload"], label: "Upload" },
    { key: ["analyzing"], label: "Analyzing" },
    { key: ["segments", "splitting"], label: "Segments" },
    { key: ["transcribing", "detecting"], label: "Transcription" },
    { key: ["overlays"], label: "Overlays" },
    { key: ["hookTexts"], label: "Hook Text" },
    { key: ["generating"], label: "Generating" },
    { key: ["done"], label: "Done" },
  ];

  const currentIdx = phases.findIndex((p) => p.key.includes(phase));

  return (
    <div className="flex items-center gap-1">
      {phases.map((p, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isError = phase === "error" && isCurrent;
        return (
          <div key={p.label} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 ${
                  isComplete
                    ? "bg-success-500"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isError
                  ? "bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-400"
                  : isComplete
                  ? "bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-400"
                  : isCurrent
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
              }`}
            >
              {isComplete && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              )}
              {isCurrent && !isComplete && !isError && (
                <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
              )}
              {p.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BulkSchedulePanel({ job }: { job: JobStatus }) {
  const router = useRouter();
  const [postType, setPostType] = useState<"reel" | "trial_reel">("trial_reel");
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [intervalMin, setIntervalMin] = useState(15);
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountConnected, setAccountConnected] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    fetch("/api/instagram/account")
      .then((r) => r.json())
      .then((d) => {
        setAccountConnected(d.connected);
        if (d.connected) setAccountId(d.id);
      })
      .catch(() => setAccountConnected(false));
  }, []);

  async function handleScheduleAll() {
    if (!accountId) return;
    setScheduling(true);
    setError(null);
    setProgress(0);

    try {
      const results = job.hookResults;
      const base = new Date(startTime);

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        setProgress(i + 1);

        const videoRes = await fetch(
          `/api/video-generator/output/${job.id}/${r.outputFile}`
        );
        const videoBlob = await videoRes.blob();
        const formData = new FormData();
        formData.append("video", videoBlob, r.outputFile);
        const uploadRes = await fetch("/api/scheduler/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error);

        const scheduledAt = new Date(
          base.getTime() + i * intervalMin * 60 * 1000
        );

        const postRes = await fetch("/api/scheduler/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ig_account_id: accountId,
            video_storage_path: uploadData.storagePath,
            video_public_url: uploadData.publicUrl,
            caption: "",
            post_type: postType,
            graduation_strategy: postType === "trial_reel" ? "MANUAL" : null,
            scheduled_at: scheduledAt.toISOString(),
          }),
        });
        const postData = await postRes.json();
        if (postData.error) throw new Error(postData.error);
      }

      router.push("/scheduler");
    } catch (e: any) {
      setError(e.message);
      setScheduling(false);
    }
  }

  if (accountConnected === null) return null;

  if (!accountConnected) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">
              Schedule to Instagram
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Connect your Instagram account to schedule these videos
            </p>
          </div>
          <a
            href="/api/instagram/auth"
            className="rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Connect Instagram
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/5 p-5">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-4">
        Schedule to Instagram
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Post Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setPostType("trial_reel")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                postType === "trial_reel"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}
            >
              Trial Reel
            </button>
            <button
              onClick={() => setPostType("reel")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                postType === "reel"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}
            >
              Reel
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Start Time
          </label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Interval
          </label>
          <select
            value={intervalMin}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={5}>Every 5 min</option>
            <option value={10}>Every 10 min</option>
            <option value={15}>Every 15 min</option>
            <option value={30}>Every 30 min</option>
            <option value={60}>Every 1 hour</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 mb-3">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleScheduleAll}
        disabled={scheduling}
        className="w-full sm:w-auto rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black px-6 py-2.5 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {scheduling
          ? `Uploading ${progress}/${job.hookResults.length}...`
          : `Schedule ${job.hookResults.length} Videos as ${postType === "trial_reel" ? "Trial Reels" : "Reels"}`}
      </button>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function VideoGenerator() {
  const [mode, setMode] = useState<ProcessingMode>("manual");
  const [phase, setPhase] = useState<WorkflowPhase>("upload");
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptWord[]>([]);
  const [overlayDetection, setOverlayDetection] =
    useState<OverlayDetection | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brollFiles, setBrollFiles] = useState<BrollFile[]>([]);
  const [brollLoading, setBrollLoading] = useState(true);
  const [uploadingBroll, setUploadingBroll] = useState(false);
  const [sfxAssets, setSfxAssets] = useState<Record<string, { exists: boolean; sizeMb: number }>>({});
  const [uploadingSfx, setUploadingSfx] = useState<string | null>(null);
  const [hookTexts, setHookTexts] = useState<string[]>([]);
  const [hookTextsLoading, setHookTextsLoading] = useState(false);
  const [pendingOverlaySlots, setPendingOverlaySlots] = useState<OverlaySlot[]>([]);
  const [autoJobs, setAutoJobs] = useState<AutoJobStatus[]>([]);
  const [previewVideo, setPreviewVideo] = useState<{ jobId: string; file: string } | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<1 | 2>(1);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [useAllMinis, setUseAllMinis] = useState(true);
  const [scriptEntries, setScriptEntries] = useState<{ year?: string; make: string; model: string; part: string }[]>([]);
  const [scriptUploading, setScriptUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const brollInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const confirmedSegmentsRef = useRef<Segment[]>([]);

  useEffect(() => {
    loadBroll();
    loadSfxAssets();
    loadScriptSheet();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (autoPollRef.current) clearInterval(autoPollRef.current);
    };
  }, []);

  function startAutoJobPolling() {
    if (autoPollRef.current) clearInterval(autoPollRef.current);
    autoPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/video-generator/auto-process");
        const data = await res.json();
        setAutoJobs(data.jobs ?? []);
        const allDone = (data.jobs ?? []).every(
          (j: AutoJobStatus) => j.phase === "done" || j.phase === "error"
        );
        if (allDone && (data.jobs ?? []).length > 0) {
          if (autoPollRef.current) clearInterval(autoPollRef.current);
          autoPollRef.current = null;
        }
      } catch {}
    }, 2000);
  }

  async function handleAutoUpload(files: File[]) {
    if (files.length === 0) return;
    setBulkUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append("video", file);
      if (!useAllMinis) formData.append("localOnly", "1");
      try {
        await fetch("/api/video-generator/auto-process", {
          method: "POST",
          body: formData,
        });
      } catch (err: any) {
        console.error(`Failed to queue ${file.name}:`, err);
      }
    }

    setBulkUploading(false);
    setBulkFiles([]);
    startAutoJobPolling();
  }

  async function handleEditManually(autoJobId: string) {
    try {
      const res = await fetch(`/api/video-generator/auto-job-data/${autoJobId}`);
      if (!res.ok) throw new Error("Failed to load job data");
      const data = await res.json();

      setMode("manual");
      setJobId(autoJobId);

      if (data.segments) setSegments(data.segments);
      if (data.transcript) setTranscript(data.transcript);
      if (data.overlayDetection) setOverlayDetection(data.overlayDetection);
      if (data.hookTexts) setHookTexts(data.hookTexts);

      if (data.overlayDetection) {
        const slots: OverlaySlot[] = [
          { key: "part", label: "Part Picture", detection: data.overlayDetection.part, file: null, uploadedFilename: null },
          { key: "car", label: "Car Picture", detection: data.overlayDetection.car, file: null, uploadedFilename: null },
          { key: "price", label: "Price Card", detection: data.overlayDetection.price, file: null, uploadedFilename: null },
          { key: "soldPrice", label: "eBay Sold Listing", detection: data.overlayDetection.soldPrice, file: null, uploadedFilename: null },
        ];
        if (data.overlaySlots) {
          for (const os of data.overlaySlots) {
            const match = slots.find((s) => s.key === os.slot);
            if (match) match.uploadedFilename = os.filename;
          }
        }
        setPendingOverlaySlots(slots);
      }

      setPhase("segments");
    } catch (err: any) {
      console.error("Failed to load auto job for manual editing:", err);
    }
  }

  function togglePreview(jobIdVal: string, file: string) {
    if (previewVideo?.jobId === jobIdVal && previewVideo?.file === file) {
      setPreviewVideo(null);
    } else {
      setPreviewVideo({ jobId: jobIdVal, file });
      setPreviewSpeed(1);
    }
  }

  async function loadBroll() {
    setBrollLoading(true);
    try {
      const res = await fetch("/api/video-generator/broll");
      const data = await res.json();
      setBrollFiles(data.files ?? []);
    } catch {
      setBrollFiles([]);
    }
    setBrollLoading(false);
  }

  async function uploadBroll(files: FileList) {
    setUploadingBroll(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    try {
      await fetch("/api/video-generator/broll", {
        method: "POST",
        body: formData,
      });
      await loadBroll();
    } catch {}
    setUploadingBroll(false);
  }

  async function loadSfxAssets() {
    try {
      const res = await fetch("/api/video-generator/assets");
      const data = await res.json();
      setSfxAssets(data.assets ?? {});
    } catch {}
  }

  async function uploadSfx(slot: string, file: File) {
    setUploadingSfx(slot);
    try {
      const formData = new FormData();
      formData.append("slot", slot);
      formData.append("file", file);
      await fetch("/api/video-generator/assets", {
        method: "POST",
        body: formData,
      });
      await loadSfxAssets();
    } catch {}
    setUploadingSfx(null);
  }

  async function loadScriptSheet() {
    try {
      const res = await fetch("/api/video-generator/script-sheet");
      const data = await res.json();
      setScriptEntries(data.entries ?? []);
    } catch {}
  }

  async function uploadScriptSheet(file: File) {
    setScriptUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/video-generator/script-sheet", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setScriptEntries(data.entries ?? []);
    } catch {}
    setScriptUploading(false);
  }

  async function clearScriptSheet() {
    await fetch("/api/video-generator/script-sheet", { method: "DELETE" });
    setScriptEntries([]);
  }

  async function handleUploadAndAnalyze() {
    if (!rawFile) return;
    if (brollFiles.length === 0) {
      setError("Upload at least one B-roll clip before proceeding.");
      return;
    }

    setError(null);
    setPhase("analyzing");

    try {
      const formData = new FormData();
      formData.append("video", rawFile);

      const res = await fetch("/api/video-generator/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setJobId(data.jobId);
      setSegments(data.segments);
      setTotalDuration(data.totalDuration);
      setPhase("segments");
    } catch (err: any) {
      setError(err.message);
      setPhase("error");
    }
  }

  async function handleConfirmSegments(confirmed: Segment[]) {
    if (!jobId) return;
    confirmedSegmentsRef.current = confirmed;
    setPhase("splitting");
    setError(null);

    try {
      const res = await fetch("/api/video-generator/split-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          segments: confirmed.filter((s) => s.label !== "Discard"),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Now transcribe the body segment
      setPhase("transcribing");
      const bodySegment = confirmed.find((s) => s.label === "Body");
      if (!bodySegment) throw new Error("No body segment found");

      const transcribeRes = await fetch("/api/video-generator/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          start: bodySegment.start,
          end: bodySegment.end,
        }),
      });
      const transcribeData = await transcribeRes.json();
      if (transcribeData.error) throw new Error(transcribeData.error);

      setTranscript(transcribeData.transcript.words);

      // Detect overlay timestamps via NLP
      setPhase("detecting");
      const detectRes = await fetch("/api/video-generator/detect-overlays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: transcribeData.transcript.words }),
      });
      const detectData = await detectRes.json();
      if (detectData.error) throw new Error(detectData.error);

      setOverlayDetection(detectData.overlays);
      setPhase("overlays");
    } catch (err: any) {
      setError(err.message);
      setPhase("error");
    }
  }

  async function handleOverlaysDone(overlaySlots: OverlaySlot[]) {
    setPendingOverlaySlots(overlaySlots);
    setPhase("hookTexts");
    setHookTextsLoading(true);

    const numHooks = confirmedSegmentsRef.current.filter(
      (s) => s.label.startsWith("Hook")
    ).length;

    const partText = overlayDetection?.part?.text;
    const carText = overlayDetection?.car?.text;
    const priceText = overlayDetection?.price?.text;
    const soldText = overlayDetection?.soldPrice?.text;

    try {
      const res = await fetch("/api/video-generator/hook-texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numHooks: Math.max(numHooks, 1),
          partName: partText,
          carName: carText,
          yardPrice: priceText,
          soldPrice: soldText,
        }),
      });
      const data = await res.json();
      if (data.texts && Array.isArray(data.texts)) {
        setHookTexts(data.texts);
      } else {
        setHookTexts(Array(numHooks).fill("Junkyard Flip"));
      }
    } catch {
      setHookTexts(Array(numHooks).fill("Junkyard Flip"));
    } finally {
      setHookTextsLoading(false);
    }
  }

  async function handleGenerate(overlaySlots: OverlaySlot[], texts?: string[]) {
    if (!jobId) return;
    setPhase("generating");
    setError(null);

    try {
      const overlays = overlaySlots
        .filter((s) => s.uploadedFilename && s.detection)
        .map((s) => ({
          slot: s.key,
          filename: s.uploadedFilename!,
          timestamp: s.detection!.start,
        }));

      const res = await fetch("/api/video-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          overlays,
          hookTexts: texts || hookTexts,
          transcript: transcript.length > 0 ? transcript : undefined,
          segments: segments.length > 0 ? segments : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Poll for job status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/video-generator/status/${data.jobId}`
          );
          const status: JobStatus = await statusRes.json();
          setJob(status);
          if (status.phase === "done" || status.phase === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (status.phase === "error") {
              setError(status.error ?? "Unknown error");
              setPhase("error");
            } else {
              setPhase("done");
            }
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      setError(err.message);
      setPhase("error");
    }
  }

  function reset() {
    setPhase("upload");
    setRawFile(null);
    setJobId(null);
    setSegments([]);
    setTotalDuration(0);
    setTranscript([]);
    setOverlayDetection(null);
    setJob(null);
    setError(null);
    setHookTexts([]);
    setPendingOverlaySlots([]);
    confirmedSegmentsRef.current = [];
    if (pollRef.current) clearInterval(pollRef.current);
  }

  const videoUrl = jobId
    ? `/api/video-generator/uploads/${jobId}`
    : null;

  return (
    <DashboardLayout title="Video Generator">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap"
        rel="stylesheet"
      />
      <div className="space-y-6">
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setMode("manual")}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "manual"
                  ? "bg-brand-500 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setMode("auto")}
              className={`px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "auto"
                  ? "bg-brand-500 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              Auto / Bulk
            </button>
          </div>
          {mode === "manual" && phase !== "upload" && (
            <button
              onClick={reset}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>

        {/* ─── AUTO / BULK MODE ─── */}
        {mode === "auto" && (
          <>
            {/* Distribution Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {useAllMinis ? "All Mac Minis" : "This Mac Mini Only"}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {useAllMinis ? "Distribute across local + 2 remote Minis" : "Process everything on this machine"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUseAllMinis((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  useAllMinis ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    useAllMinis ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Bulk Upload Zone */}
            <div
              className="relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02] hover:border-brand-400 dark:hover:border-brand-500"
              onClick={() => bulkInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = Array.from(e.dataTransfer.files).filter((f) =>
                  /\.(mp4|mov|mkv|avi|webm)$/i.test(f.name)
                );
                if (dropped.length > 0) {
                  setBulkFiles(dropped);
                  handleAutoUpload(dropped);
                }
              }}
            >
              <input
                ref={bulkInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) {
                    setBulkFiles(files);
                    handleAutoUpload(files);
                  }
                  e.target.value = "";
                }}
              />
              {bulkUploading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Uploading {bulkFiles.length} video{bulkFiles.length !== 1 ? "s" : ""}...
                  </span>
                </div>
              ) : (
                <>
                  <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Drop raw videos here or click to select
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Supports multiple files — each runs the full pipeline automatically
                  </p>
                </>
              )}
            </div>

            {/* Auto Jobs Dashboard */}
            {autoJobs.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-base font-bold text-gray-800 dark:text-white/90">
                    Processing Queue
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {autoJobs.filter((j) => j.phase === "done").length}/{autoJobs.length} complete
                    {autoJobs.filter((j) => j.phase === "queued").length > 0 && (
                      <> &middot; {autoJobs.filter((j) => j.phase === "queued").length} queued</>
                    )}
                  </p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {autoJobs.map((aj) => {
                    const flaggedIndices = new Set(
                      (aj.hookFlags ?? []).filter((f) => f.flagged).map((f) => f.index)
                    );

                    return (
                      <div key={aj.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {aj.phase === "done" ? (
                                <div className="h-2.5 w-2.5 rounded-full bg-success-500 flex-shrink-0" />
                              ) : aj.phase === "error" ? (
                                <div className="h-2.5 w-2.5 rounded-full bg-error-500 flex-shrink-0" />
                              ) : aj.phase === "queued" ? (
                                <div className="h-2.5 w-2.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                              ) : (
                                <div className="h-2.5 w-2.5 rounded-full bg-brand-500 animate-pulse flex-shrink-0" />
                              )}
                              <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">
                                {aj.videoName || aj.id.slice(0, 8)}
                              </p>
                              <span
                                className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  aj.phase === "done"
                                    ? "bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-400"
                                    : aj.phase === "error"
                                    ? "bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-400"
                                    : aj.phase === "queued"
                                    ? "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400"
                                    : "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                                }`}
                              >
                                {aj.phase.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {aj.error || aj.progress}
                            </p>
                            {aj.phase === "generating_hooks" && aj.totalHooks > 0 && (
                              <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="bg-brand-500 h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${Math.round(
                                      (aj.currentHook / aj.totalHooks) * 100
                                    )}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {aj.phase === "done" && aj.outputFiles.length > 0 && (
                              <>
                                <div className="flex items-center gap-1">
                                  {aj.outputFiles.map((f, fIdx) => {
                                    const isFlagged = flaggedIndices.has(fIdx);
                                    const flagReason = (aj.hookFlags ?? []).find((fl) => fl.index === fIdx)?.reason;
                                    const isActive = previewVideo?.jobId === aj.id && previewVideo?.file === f;

                                    return (
                                      <div key={f} className="inline-flex items-center gap-px">
                                        <div className="inline-flex items-center rounded-lg overflow-hidden">
                                          <button
                                            onClick={() => togglePreview(aj.id, f)}
                                            className={`px-1.5 py-1.5 transition-colors ${
                                              isActive
                                                ? "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300"
                                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                            }`}
                                            title={`Preview ${f.replace(/\.mp4$/, "")}`}
                                          >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            </svg>
                                          </button>
                                          <a
                                            href={`/api/video-generator/download/${aj.id}/${encodeURIComponent(f)}`}
                                            className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                                              isFlagged
                                                ? "bg-orange-50 dark:bg-orange-500/10 text-orange-500 dark:text-orange-400"
                                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                            }`}
                                            title={isFlagged ? (flagReason || "Possible stumble") : `Download ${f.replace(/\.mp4$/, "")}`}
                                            download
                                          >
                                            {fIdx + 1}
                                          </a>
                                        </div>
                                        <button
                                          onClick={async () => {
                                            const newFlagged = !isFlagged;
                                            try {
                                              await fetch("/api/video-generator/auto-process", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ jobId: aj.id, hookIndex: fIdx, flagged: newFlagged }),
                                              });
                                              setAutoJobs((prev) =>
                                                prev.map((j) => {
                                                  if (j.id !== aj.id) return j;
                                                  const flags = [...(j.hookFlags ?? [])];
                                                  const ex = flags.find((fl) => fl.index === fIdx);
                                                  if (ex) {
                                                    ex.flagged = newFlagged;
                                                    if (newFlagged && !ex.reason) ex.reason = "Manually flagged";
                                                    if (!newFlagged) ex.reason = undefined;
                                                  } else {
                                                    flags.push({ index: fIdx, flagged: newFlagged, reason: newFlagged ? "Manually flagged" : undefined });
                                                  }
                                                  return { ...j, hookFlags: flags };
                                                })
                                              );
                                            } catch {}
                                          }}
                                          className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                                            isFlagged
                                              ? "bg-orange-100 dark:bg-orange-500/20 text-orange-500 hover:bg-orange-200 dark:hover:bg-orange-500/30"
                                              : "bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
                                          }`}
                                          title={isFlagged ? (flagReason || "Flagged — click to unflag") : "Click to flag this video"}
                                        >
                                          <svg className="w-3.5 h-3.5" fill={isFlagged ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isFlagged ? 0 : 2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18m0-18l9 6-9 6" />
                                          </svg>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <a
                                  href={`/api/video-generator/download-all/${aj.id}`}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-success-500 hover:bg-success-50 dark:hover:bg-success-500/10 transition-colors"
                                  title={`Download all (${aj.outputFiles.length} videos)`}
                                  download
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </a>
                              </>
                            )}
                            {(aj.phase === "done" || aj.phase === "error") && (
                              <button
                                onClick={() => handleEditManually(aj.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
                                title="Edit Manually"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this job and all its files?")) return;
                                await fetch(`/api/video-generator/auto-process?jobId=${aj.id}`, { method: "DELETE" });
                                setAutoJobs((prev) => prev.filter((j) => j.id !== aj.id));
                              }}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                              title="Delete job"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Inline Preview Player */}
                        {previewVideo?.jobId === aj.id && aj.outputFiles.includes(previewVideo.file) && (
                          <div className="mt-3 rounded-lg overflow-hidden bg-black relative">
                            <video
                              ref={previewRef}
                              key={`${aj.id}-${previewVideo.file}`}
                              src={`/api/video-generator/download/${aj.id}/${encodeURIComponent(previewVideo.file)}?preview=1`}
                              controls
                              autoPlay
                              className="w-full max-h-[480px]"
                              onLoadedMetadata={() => {
                                if (previewRef.current) {
                                  previewRef.current.playbackRate = previewSpeed;
                                }
                              }}
                            />
                            <div className="absolute top-2 right-2 flex gap-1">
                              <button
                                onClick={() => {
                                  const newSpeed = previewSpeed === 1 ? 2 : 1;
                                  setPreviewSpeed(newSpeed);
                                  if (previewRef.current) previewRef.current.playbackRate = newSpeed;
                                }}
                                className="px-2 py-1 text-[10px] font-bold rounded bg-black/70 text-white hover:bg-black/90 transition-colors"
                              >
                                {previewSpeed}x
                              </button>
                              <button
                                onClick={() => setPreviewVideo(null)}
                                className="px-2 py-1 text-[10px] font-bold rounded bg-black/70 text-white hover:bg-black/90 transition-colors"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* B-Roll Library (shared across modes) */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
                B-Roll Library
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {brollLoading
                  ? "Loading..."
                  : `${brollFiles.length} clip${brollFiles.length !== 1 ? "s" : ""} available`}
              </p>
            </div>
            <div>
              <input
                ref={brollInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0)
                    uploadBroll(e.target.files);
                }}
              />
              <button
                onClick={() => brollInputRef.current?.click()}
                disabled={uploadingBroll}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {uploadingBroll ? "Uploading..." : "Upload B-Roll"}
              </button>
            </div>
          </div>
          {brollFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brollFiles.map((f) => (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  <span className="text-brand-500 dark:text-brand-400">
                    &#9654;
                  </span>
                  {f.name}
                  <span className="text-gray-400 dark:text-gray-500">
                    ({f.sizeMb} MB)
                  </span>
                </span>
              ))}
            </div>
          )}
          {!brollLoading && brollFiles.length === 0 && (
            <p className="text-xs text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/5 border border-warning-400/20 dark:border-warning-500/20 rounded-lg px-3 py-2">
              No B-roll clips found. Upload clips or copy them to{" "}
              <code className="font-mono text-xs">media/broll/</code>
            </p>
          )}
        </div>

        {/* Sound Effects & Color Grading */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-3">
            Assets
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { slot: "riser.mp3", label: "Riser SFX", desc: "Plays during hook transitions", accept: "audio/*", icon: "audio" as const },
              { slot: "click.mp3", label: "Click SFX", desc: "Plays when overlay images appear", accept: "audio/*", icon: "audio" as const },
              { slot: "grade.cube", label: "Color LUT", desc: "3D LUT for base color grade", accept: ".cube,.3dl,.lut", icon: "lut" as const },
            ].map(({ slot, label, desc, accept, icon }) => {
              const asset = sfxAssets[slot];
              const isUploading = uploadingSfx === slot;
              return (
                <div
                  key={slot}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    asset?.exists
                      ? "border-success-300 dark:border-success-500/20 bg-success-50 dark:bg-success-500/5"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                        asset?.exists
                          ? "bg-success-100 dark:bg-success-500/10"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      {icon === "lut" ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          className={
                            asset?.exists
                              ? "text-success-600 dark:text-success-400"
                              : "text-gray-400"
                          }
                        >
                          <path
                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                            fill="currentColor"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          className={
                            asset?.exists
                              ? "text-success-600 dark:text-success-400"
                              : "text-gray-400"
                          }
                        >
                          <path
                            d="M9 18V5l12-2v13M9 18c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zM21 16c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white/90">
                        {label}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {asset?.exists
                          ? `${slot} (${asset.sizeMb} MB)`
                          : desc}
                      </p>
                    </div>
                  </div>
                  <label className="flex-shrink-0 cursor-pointer">
                    <input
                      type="file"
                      accept={accept}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadSfx(slot, f);
                        e.target.value = "";
                      }}
                    />
                    <span
                      className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        isUploading
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                          : asset?.exists
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          : "bg-brand-500 text-white hover:bg-brand-600"
                      }`}
                    >
                      {isUploading
                        ? "Uploading..."
                        : asset?.exists
                        ? "Replace"
                        : "Upload"}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            LUT is applied first, then exposure +20 &amp; shadows +5 are added on top automatically.
          </p>
        </div>

        {/* Script Sheet */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
                Script Sheet
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {scriptEntries.length > 0
                  ? `${scriptEntries.length} vehicle${scriptEntries.length !== 1 ? "s" : ""} loaded — corrects transcription errors`
                  : "Upload your PDF script to improve vehicle/part matching"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scriptEntries.length > 0 && (
                <button
                  onClick={clearScriptSheet}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                  title="Clear script sheet"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <label className="flex-shrink-0 cursor-pointer">
                <input
                  ref={scriptInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadScriptSheet(f);
                    e.target.value = "";
                  }}
                />
                <span
                  className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    scriptUploading
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                      : scriptEntries.length > 0
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      : "bg-brand-500 text-white hover:bg-brand-600"
                  }`}
                >
                  {scriptUploading ? "Parsing..." : scriptEntries.length > 0 ? "Replace" : "Upload PDF"}
                </span>
              </label>
            </div>
          </div>
          {scriptEntries.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {scriptEntries.map((e, i) => (
                <div key={i} className="px-3 py-1.5 flex items-center gap-3 text-xs">
                  <span className="text-gray-400 w-5 text-right">{i + 1}</span>
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {[e.year, e.make, e.model].filter(Boolean).join(" ")}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">—</span>
                  <span className="text-gray-600 dark:text-gray-300">{e.part}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── MANUAL MODE ─── */}
        {mode === "manual" && (
          <>
        {/* Phase Indicator */}
        <div className="flex items-center justify-between">
          <PhaseIndicator phase={phase} />
        </div>

        {/* Phase: Upload */}
        {phase === "upload" && (
          <>
            <VideoDropZone file={rawFile} onFile={setRawFile} />
            <button
              onClick={handleUploadAndAnalyze}
              disabled={!rawFile}
              className="w-full rounded-xl bg-brand-500 px-8 py-3 text-base font-bold text-white shadow-theme-sm hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Upload & Analyze
            </button>
          </>
        )}

        {/* Phase: Analyzing */}
        {phase === "analyzing" && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Analyzing video for silence breaks...
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Using FFmpeg silencedetect to find segment boundaries
            </p>
          </div>
        )}

        {/* Phase: Segment Review */}
        {phase === "segments" && videoUrl && (
          <SegmentEditor
            segments={segments}
            totalDuration={totalDuration}
            videoUrl={videoUrl}
            onConfirm={handleConfirmSegments}
          />
        )}

        {/* Phase: Splitting / Transcribing / Detecting */}
        {(phase === "splitting" ||
          phase === "transcribing" ||
          phase === "detecting") && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {phase === "splitting" && "Splitting video into segments..."}
              {phase === "transcribing" &&
                "Transcribing body audio with word timestamps..."}
              {phase === "detecting" &&
                "Detecting overlay insertion points with AI..."}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {phase === "splitting" && "Extracting hooks and body from the raw video"}
              {phase === "transcribing" &&
                "Running faster-whisper locally for word-level timestamps"}
              {phase === "detecting" &&
                "Using Claude to identify part, car, price, and sold listing mentions"}
            </p>
          </div>
        )}

        {/* Phase: Overlay Images */}
        {phase === "overlays" && overlayDetection && jobId && (
          <>
            {/* Transcript preview */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-2">
                Transcript
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {transcript.map((w) => w.word).join(" ")}
              </p>

              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(
                  [
                    { key: "part", label: "Part" },
                    { key: "car", label: "Car" },
                    { key: "price", label: "Yard Price" },
                    { key: "soldPrice", label: "Sold Price" },
                  ] as const
                ).map(({ key, label }) => {
                  const d = overlayDetection[key];
                  return (
                    <div
                      key={key}
                      className={`rounded-lg p-3 ${
                        d
                          ? "bg-success-50 dark:bg-success-500/5 border border-success-200 dark:border-success-500/20"
                          : "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                        {label}
                      </p>
                      {d ? (
                        <>
                          <p className="text-sm font-bold text-gray-900 dark:text-white/90 mt-0.5">
                            &ldquo;{d.text}&rdquo;
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            at {formatTime(d.start)}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">
                          Not detected
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <OverlayPanel
              detection={overlayDetection}
              jobId={jobId}
              onAllUploaded={handleOverlaysDone}
            />
          </>
        )}

        {/* Phase: Hook Texts */}
        {phase === "hookTexts" && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-800 dark:text-white/90">
                Hook Text Banners
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Each video gets a green text banner between the B-roll and talking head. Edit or regenerate the text for each hook.
              </p>
            </div>
            <div className="p-5 space-y-4">
              {hookTextsLoading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Generating hook text ideas...
                  </span>
                </div>
              ) : (
                <>
                  {hookTexts.map((text, i) => (
                    <div key={i} className="space-y-2">
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Hook {i + 1}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={text}
                          onChange={(e) => {
                            const updated = [...hookTexts];
                            updated[i] = e.target.value;
                            setHookTexts(updated);
                          }}
                          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/5 px-3 py-2 text-sm text-gray-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                          placeholder="Enter hook text..."
                        />
                      </div>
                      {/* Banner preview */}
                      <div className="flex justify-center">
                        <div
                          className="rounded-2xl px-8 py-3 text-center"
                          style={{ backgroundColor: "#1C4629" }}
                        >
                          <span
                            className="text-white text-lg font-extrabold tracking-wide"
                            style={{ fontFamily: "Montserrat, sans-serif" }}
                          >
                            {text || "Hook Text"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      handleGenerate(pendingOverlaySlots, hookTexts)
                    }
                    disabled={hookTexts.some((t) => !t.trim())}
                    className="w-full rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-white shadow-theme-sm hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generate Videos with Text Banners
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Phase: Generating */}
        {phase === "generating" && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
            {job ? (
              <ProgressBar current={job.currentHook} total={job.totalHooks} />
            ) : (
              <div className="text-center py-4">
                <div className="flex justify-center mb-4">
                  <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Composing body with overlays and generating videos...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-error-300 dark:border-error-500/20 bg-error-50 dark:bg-error-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-error-600 dark:text-error-400">
              Error
            </p>
            <p className="text-sm text-error-500 dark:text-error-300 mt-1">
              {error}
            </p>
          </div>
        )}

        {/* Phase: Done - Results */}
        {phase === "done" && job && job.hookResults.length > 0 && (
          <>
            <div className="rounded-2xl border border-success-300 dark:border-success-500/20 bg-success-50 dark:bg-success-500/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-success-200 dark:border-success-500/20">
                <h4 className="font-bold text-success-600 dark:text-success-400">
                  {job.hookResults.length} Videos Ready
                </h4>
                <p className="text-xs text-success-500/70 mt-0.5">
                  Completed in{" "}
                  {((job.completedAt! - job.createdAt) / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="divide-y divide-success-200 dark:divide-success-500/10">
                {job.hookResults.map((r) => (
                  <div
                    key={r.hookIndex}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white/90">
                        Video {r.hookIndex + 1}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        B-Roll: {r.brollFile}
                      </p>
                    </div>
                    <a
                      href={`/api/video-generator/output/${job.id}/${r.outputFile}`}
                      download
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <BulkSchedulePanel job={job} />
          </>
        )}

        {/* How It Works */}
        {phase === "upload" && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-3">
              How It Works
            </h4>
            <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
              <li>
                Upload B-roll clips to the library (one-time setup)
              </li>
              <li>
                Drop your{" "}
                <span className="text-gray-900 dark:text-gray-200 font-medium">
                  single raw recording
                </span>{" "}
                containing all hooks and the body
              </li>
              <li>
                The system auto-detects silence breaks to separate hooks from
                the body
              </li>
              <li>
                Review and adjust segment labels, then the body is transcribed
                for overlay detection
              </li>
              <li>
                Upload 4 overlay images (part, car, yard price, sold listing)
                for the body section
              </li>
              <li>
                Each hook gets: random B-roll (top) + talking head (bottom) +
                color grading + riser SFX
              </li>
              <li>
                The body gets: overlay images (top) at detected timestamps +
                talking head (bottom) + click SFX
              </li>
              <li>
                Each processed hook is concatenated with the composed body to
                produce final videos
              </li>
            </ol>
            <div className="mt-4 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-800 pt-3">
              <p>
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Supported input formats:
                </span>{" "}
                1:1 square, 16:9 landscape, 9:16 portrait — auto-scaled to fill
              </p>
              <p className="mt-1">
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  Optional assets:
                </span>{" "}
                Place{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                  grade.cube
                </code>{" "}
                (LUT),{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                  riser.mp3
                </code>
                , and{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                  click.mp3
                </code>{" "}
                in{" "}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
                  media/assets/
                </code>
              </p>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
