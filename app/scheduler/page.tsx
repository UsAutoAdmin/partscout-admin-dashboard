"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

type PostType = "reel" | "trial_reel";
type PostStatus = "scheduled" | "publishing" | "published" | "failed";

interface ScheduledPost {
  id: string;
  ig_account_id: string;
  video_storage_path: string;
  video_public_url: string;
  caption: string;
  post_type: PostType;
  graduation_strategy: string | null;
  scheduled_at: string;
  status: PostStatus;
  ig_media_id: string | null;
  error: string | null;
  created_at: string;
  instagram_accounts?: { ig_username: string };
}

interface IgAccount {
  connected: boolean;
  id?: string;
  username?: string;
  expiresAt?: string;
}

// ─── Helpers ────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am-11pm
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<PostStatus, string> = {
  scheduled: "bg-blue-500",
  publishing: "bg-yellow-500 animate-pulse",
  published: "bg-green-500",
  failed: "bg-red-500",
};

// ─── Schedule Modal ─────────────────────────────────────

function ScheduleModal({
  initialDate,
  accountId,
  onClose,
  onSaved,
}: {
  initialDate: Date;
  accountId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [postType, setPostType] = useState<PostType>("trial_reel");
  const [graduationStrategy, setGraduationStrategy] = useState("MANUAL");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalISO(initialDate));
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  function handleFileChange(file: File) {
    setVideoFile(file);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!videoFile) {
      setError("Please select a video file");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      const uploadRes = await fetch("/api/scheduler/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(uploadData.error);

      setSaving(true);
      setUploading(false);

      const postRes = await fetch("/api/scheduler/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ig_account_id: accountId,
          video_storage_path: uploadData.storagePath,
          video_public_url: uploadData.publicUrl,
          caption,
          post_type: postType,
          graduation_strategy: postType === "trial_reel" ? graduationStrategy : null,
          scheduled_at: new Date(scheduledAt).toISOString(),
        }),
      });

      const postData = await postRes.json();
      if (postData.error) throw new Error(postData.error);

      onSaved();
    } catch (e: any) {
      setError(e.message);
      setUploading(false);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Schedule Post</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Post Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Post Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPostType("reel")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  postType === "reel"
                    ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Reel
              </button>
              <button
                onClick={() => setPostType("trial_reel")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  postType === "trial_reel"
                    ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Trial Reel
              </button>
            </div>
          </div>

          {/* Graduation Strategy (trial only) */}
          {postType === "trial_reel" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Graduation Strategy</label>
              <select
                value={graduationStrategy}
                onChange={(e) => setGraduationStrategy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="MANUAL">Manual - You decide when to share</option>
                <option value="SS_PERFORMANCE">Auto - Share if it performs well</option>
              </select>
            </div>
          )}

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Caption</label>
              <span className="text-xs text-gray-400">{caption.length} / 2200</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              rows={4}
              placeholder="Write your caption..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Video Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video</label>
            {videoPreviewUrl ? (
              <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[300px] mx-auto">
                <video src={videoPreviewUrl} className="w-full h-full object-contain" controls muted />
                <button
                  onClick={() => { setVideoFile(null); if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); setVideoPreviewUrl(null); }}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02] p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex justify-center mb-2">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-400">
                      <path d="M10 13.333V6.667m0 0L7.5 9.167m2.5-2.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Click to upload video</p>
                <p className="text-xs text-gray-400 mt-0.5">MP4, MOV supported</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
            />
          </div>

          {/* Schedule Date/Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || saving || !videoFile}
            className="px-5 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading..." : saving ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post Card (calendar slot) ──────────────────────────

function PostCard({ post, onClick }: { post: ScheduledPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[post.status]}`} />
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate">
          {fmtTime(new Date(post.scheduled_at))}
        </span>
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-500 truncate mt-0.5">
        {post.post_type === "trial_reel" ? "Trial" : "Reel"}
        {post.caption ? ` · ${post.caption.slice(0, 30)}` : ""}
      </p>
    </button>
  );
}

// ─── Post Detail Modal ──────────────────────────────────

function PostDetailModal({
  post,
  onClose,
  onDelete,
}: {
  post: ScheduledPost;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/scheduler/posts?id=${post.id}`, { method: "DELETE" });
      onDelete();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduled Post</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[post.status]}`} />
            <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{post.status}</span>
            <span className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              {post.post_type === "trial_reel" ? "Trial Reel" : "Reel"}
            </span>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Scheduled for</p>
            <p className="text-sm text-gray-900 dark:text-white">
              {new Date(post.scheduled_at).toLocaleString("en-US", {
                weekday: "short", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit", hour12: true,
              })}
            </p>
          </div>

          {post.caption && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Caption</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{post.caption}</p>
            </div>
          )}

          {post.error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3">
              <p className="text-xs text-red-500 font-medium mb-1">Error</p>
              <p className="text-sm text-red-600 dark:text-red-400">{post.error}</p>
            </div>
          )}

          {post.video_public_url && (
            <div className="rounded-lg overflow-hidden bg-black max-h-[200px]">
              <video src={post.video_public_url} className="w-full h-full object-contain" controls muted />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          {post.status === "scheduled" && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar ───────────────────────────────────────────

export default function SchedulerPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [account, setAccount] = useState<IgAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [viewPost, setViewPost] = useState<ScheduledPost | null>(null);

  const fetchPosts = useCallback(async () => {
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    try {
      const res = await fetch(`/api/scheduler/posts?from=${from}&to=${to}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    }
  }, [weekStart]);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/instagram/account");
      const data = await res.json();
      setAccount(data);
    } catch {
      setAccount({ connected: false });
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPosts(), fetchAccount()]).finally(() => setLoading(false));
  }, [fetchPosts, fetchAccount]);

  useEffect(() => {
    fetchPosts();
  }, [weekStart, fetchPosts]);

  function prevWeek() { setWeekStart((w) => addDays(w, -7)); }
  function nextWeek() { setWeekStart((w) => addDays(w, 7)); }
  function goToday() { setWeekStart(startOfWeek(new Date())); }

  function getPostsForSlot(dayIdx: number, hour: number) {
    const slotDate = addDays(weekStart, dayIdx);
    return posts.filter((p) => {
      const d = new Date(p.scheduled_at);
      return (
        d.getFullYear() === slotDate.getFullYear() &&
        d.getMonth() === slotDate.getMonth() &&
        d.getDate() === slotDate.getDate() &&
        d.getHours() === hour
      );
    });
  }

  function handleSlotClick(dayIdx: number, hour: number) {
    if (!account?.connected) return;
    const d = addDays(weekStart, dayIdx);
    d.setHours(hour, 0, 0, 0);
    setScheduleDate(d);
  }

  const weekEnd = addDays(weekStart, 6);

  return (
    <DashboardLayout title="Scheduler">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={prevWeek}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextWeek}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {fmtDate(weekStart)} – {fmtDate(weekEnd)}, {weekEnd.getFullYear()}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Status legend */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-500 mr-2">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Scheduled</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Published</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Failed</span>
            </div>

            {loading ? (
              <div className="h-9 w-40 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ) : account?.connected ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">@{account.username}</span>
              </div>
            ) : (
              <a
                href="/api/instagram/auth"
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                Connect Instagram
              </a>
            )}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02] overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-800">
            <div className="p-2" />
            {Array.from({ length: 7 }).map((_, i) => {
              const day = addDays(weekStart, i);
              const isToday =
                day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={`p-3 text-center border-l border-gray-200 dark:border-gray-800 ${
                    isToday ? "bg-brand-50/50 dark:bg-brand-500/5" : ""
                  }`}
                >
                  <p className="text-xs text-gray-500 dark:text-gray-500">{DAY_NAMES[i]}</p>
                  <p className={`text-lg font-semibold mt-0.5 ${
                    isToday
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-gray-900 dark:text-white"
                  }`}>
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-100 dark:border-gray-800/50 min-h-[48px]"
              >
                <div className="p-2 text-right pr-3">
                  <span className="text-[11px] text-gray-400 dark:text-gray-600">
                    {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                  </span>
                </div>
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                  const slotPosts = getPostsForSlot(dayIdx, hour);
                  const day = addDays(weekStart, dayIdx);
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={dayIdx}
                      onClick={() => handleSlotClick(dayIdx, hour)}
                      className={`border-l border-gray-100 dark:border-gray-800/50 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors ${
                        isToday ? "bg-brand-50/20 dark:bg-brand-500/[0.02]" : ""
                      }`}
                    >
                      <div className="space-y-1">
                        {slotPosts.map((p) => (
                          <PostCard
                            key={p.id}
                            post={p}
                            onClick={() => { setViewPost(p); }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Not connected notice */}
        {!loading && !account?.connected && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02] p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connect Instagram</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
              Connect your Instagram Business account to start scheduling reels and trial reels directly from your dashboard.
            </p>
            <a
              href="/api/instagram/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Connect Instagram Account
            </a>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
              Requires a Meta Developer App with instagram_business_content_publish permission
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {scheduleDate && account?.id && (
        <ScheduleModal
          initialDate={scheduleDate}
          accountId={account.id}
          onClose={() => setScheduleDate(null)}
          onSaved={() => { setScheduleDate(null); fetchPosts(); }}
        />
      )}

      {viewPost && (
        <PostDetailModal
          post={viewPost}
          onClose={() => setViewPost(null)}
          onDelete={() => { setViewPost(null); fetchPosts(); }}
        />
      )}
    </DashboardLayout>
  );
}
