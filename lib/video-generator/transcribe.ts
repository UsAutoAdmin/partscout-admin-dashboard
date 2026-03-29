import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const exec = promisify(execFile);

const PYTHON_BIN = "/Users/chaseeriksson/.openclaw/workspace/ContentMachine/venv/bin/python3";
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "transcribe-timestamps.py");

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface TranscriptResult {
  language: string;
  language_probability: number;
  full_text: string;
  words: TranscriptWord[];
}

/**
 * Extract audio from a video file to WAV using FFmpeg.
 */
export async function extractAudio(videoPath: string, outputWav: string): Promise<void> {
  await exec("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-vn",
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    outputWav,
  ], { maxBuffer: 10 * 1024 * 1024 });
}

/**
 * Transcribe an audio file using faster-whisper with word-level timestamps.
 * Uses ContentMachine's virtualenv.
 */
export async function transcribeWithTimestamps(audioPath: string): Promise<TranscriptResult> {
  const { stdout, stderr } = await exec(PYTHON_BIN, [SCRIPT_PATH, audioPath], {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 300_000,
  });

  if (stderr && !stdout.trim()) {
    throw new Error(`Transcription failed: ${stderr.slice(0, 500)}`);
  }

  return JSON.parse(stdout.trim());
}
