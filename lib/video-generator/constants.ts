import path from "path";

export const MEDIA_ROOT = path.join(process.cwd(), "media");
export const BROLL_DIR = path.join(MEDIA_ROOT, "broll");
export const ASSETS_DIR = path.join(MEDIA_ROOT, "assets");
export const UPLOADS_DIR = path.join(MEDIA_ROOT, "uploads");
export const OUTPUT_DIR = path.join(MEDIA_ROOT, "output");

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const HALF_HEIGHT = 960;

export const LUT_PATH = path.join(ASSETS_DIR, "grade.cube");
export const RISER_PATH = path.join(ASSETS_DIR, "riser.mp3");

export const FONT_PATH =
  process.env.VIDEO_FONT_PATH ||
  "/System/Library/Fonts/Supplemental/Impact.ttf";

export const TEXT_FONT_SIZE = 80;
export const TEXT_COLOR = "white";
export const TEXT_BORDER_WIDTH = 4;
export const TEXT_BORDER_COLOR = "black";

export const CLICK_SFX_PATH = path.join(ASSETS_DIR, "click.mp3");

export const OVERLAY_HOLD_SECONDS = 3;

export const HOOKS_PER_BATCH = 5;

export const REMOTE_HOME = "/Users/chaseeriksson";
export const REMOTE_ASSET_BASE = `${REMOTE_HOME}/vgen-assets`;
export const REMOTE_PYTHON_BIN = `${REMOTE_HOME}/vgen-venv/bin/python3`;
export const REMOTE_FFMPEG_BIN = `${REMOTE_HOME}/bin/ffmpeg`;
export const REMOTE_FFPROBE_BIN = `${REMOTE_HOME}/bin/ffprobe`;
export const REMOTE_FONT_PATH = `${REMOTE_ASSET_BASE}/fonts/Montserrat-ExtraBold.ttf`;
export const REMOTE_LUT_PATH = `${REMOTE_ASSET_BASE}/grade.cube`;
export const REMOTE_RISER_PATH = `${REMOTE_ASSET_BASE}/riser.mp3`;
export const REMOTE_CLICK_PATH = `${REMOTE_ASSET_BASE}/click.mp3`;
export const REMOTE_BROLL_DIR = `${REMOTE_ASSET_BASE}/broll`;
export const REMOTE_TRANSCRIBE_SCRIPT = `${REMOTE_ASSET_BASE}/transcribe-timestamps.py`;

/**
 * Color grading applied to all raw footage (B-roll, talking head, body).
 * Approximates CapCut exposure +20 and shadows +5.
 *   brightness=0.04  → additive luminance lift (lifts shadows / dark tones)
 *   gamma=1.12       → midtone/highlight exposure boost
 */
export const COLOR_GRADE_FILTER = "eq=brightness=0.04:gamma=1.12";
