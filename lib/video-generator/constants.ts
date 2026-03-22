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

export const HOOKS_PER_BATCH = 5;
