"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function TeleprompterPage() {
  const [script, setScript] = useState("");
  const [speed, setSpeed] = useState(1.5);
  const [textSize, setTextSize] = useState(2.5);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mirror, setMirror] = useState(false);

  const scrollPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const prompterRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fontSize = Math.round(20 + (textSize - 1) * 12);

  const stopScroll = useCallback(() => {
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const updateScroll = useCallback(
    (t: number) => {
      if (!prompterRef.current || !viewRef.current) return;
      const dt = t - lastTimeRef.current;
      lastTimeRef.current = t;
      const pxPerSec = speed * 80;
      scrollPosRef.current += dt * 0.001 * pxPerSec;
      const wrapper = prompterRef.current.parentElement;
      const maxScroll = Math.max(0, (wrapper?.scrollHeight ?? prompterRef.current.offsetHeight) - viewRef.current.clientHeight);
      if (scrollPosRef.current >= maxScroll) {
        scrollPosRef.current = maxScroll;
        stopScroll();
      }
      prompterRef.current.style.transform = `translateY(-${scrollPosRef.current}px)`;
      rafRef.current = requestAnimationFrame(updateScroll);
    },
    [speed, stopScroll]
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      stopScroll();
    } else {
      if (!script.trim()) return;
      setPlaying(true);
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(updateScroll);
    }
  }, [playing, script, stopScroll, updateScroll]);

  const resetScroll = useCallback(() => {
    scrollPosRef.current = 0;
    if (prompterRef.current) prompterRef.current.style.transform = "translateY(0)";
    stopScroll();
  }, [stopScroll]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "KeyR") resetScroll();
      if (e.code === "KeyF") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, resetScroll, toggleFullscreen]);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const prompterContent = (
    <div ref={containerRef} className={`flex flex-col ${isFullscreen ? "h-screen bg-black" : "h-[calc(100vh-8rem)]"}`}>
      <div className={`flex ${isFullscreen ? "h-full" : "h-full"}`}>
        {/* Editor Panel */}
        <aside className={`w-72 flex-shrink-0 flex flex-col gap-4 p-5 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 ${isFullscreen ? "hidden" : ""}`}>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Script</h2>
          <textarea
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              if (!playing) {
                scrollPosRef.current = 0;
                if (prompterRef.current) prompterRef.current.style.transform = "translateY(0)";
              }
            }}
            placeholder="Paste your script here..."
            className="flex-1 min-h-[120px] p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white/90 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50"
          />

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Speed</label>
                <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range" min="0.5" max="4" step="0.1" value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-gray-700 accent-brand-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Text Size</label>
                <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{textSize.toFixed(1)}</span>
              </div>
              <input
                type="range" min="1" max="5" step="0.5" value={textSize}
                onChange={(e) => setTextSize(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-gray-700 accent-brand-500"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} className="accent-brand-500" />
              Mirror text
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={togglePlay}
              disabled={!script.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>{playing ? "⏸" : "▶"}</span>
              <span>{playing ? "Pause" : "Play"}</span>
            </button>
            <button
              onClick={resetScroll}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Reset"
            >
              ↺
            </button>
            <button
              onClick={toggleFullscreen}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Fullscreen"
            >
              ⛶
            </button>
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Space = play/pause &middot; R = reset &middot; F = fullscreen
          </p>
        </aside>

        {/* Prompter View */}
        <div ref={viewRef} className={`flex-1 flex flex-col items-center justify-start overflow-hidden relative ${isFullscreen ? "bg-black" : "bg-gray-50 dark:bg-gray-950"}`}>
          {/* Fullscreen controls overlay */}
          {isFullscreen && (
            <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-30 hover:opacity-100 transition-opacity">
              <button onClick={togglePlay} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm">
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>
              <button onClick={resetScroll} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm">↺</button>
              <button onClick={toggleFullscreen} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm">Exit</button>
            </div>
          )}

          {/* Center guide line */}
          <div className={`absolute left-0 right-0 top-1/3 h-px ${isFullscreen ? "bg-white/10" : "bg-brand-500/20"}`} />

          <div className="pt-[33vh] pb-[67vh] px-8 w-full max-w-3xl">
            <div
              ref={prompterRef}
              className={`text-center whitespace-pre-wrap break-words leading-[1.6] transition-none ${
                isFullscreen ? "text-white" : "text-gray-900 dark:text-white/90"
              }`}
              style={{
                fontSize: `${fontSize}px`,
                transform: mirror ? `scaleX(-1) translateY(-${scrollPosRef.current}px)` : undefined,
              }}
            >
              {script || "Paste a script and press Play"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) return prompterContent;

  return (
    <DashboardLayout title="Teleprompter">
      {prompterContent}
    </DashboardLayout>
  );
}
