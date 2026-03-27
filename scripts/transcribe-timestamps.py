#!/usr/bin/env python3
"""
Transcribe an audio/video file using faster-whisper with word-level timestamps.
Outputs a JSON array of {word, start, end} objects to stdout.

Usage:
  python3 transcribe-timestamps.py <audio_or_video_path>
"""

import json
import sys
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe-timestamps.py <audio_path>"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)

    from faster_whisper import WhisperModel

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        audio_path,
        vad_filter=True,
        word_timestamps=True,
    )

    words = []
    full_text_parts = []

    for segment in segments_iter:
        full_text_parts.append(segment.text.strip())
        if segment.words:
            for w in segment.words:
                words.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                })

    result = {
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "full_text": " ".join(full_text_parts),
        "words": words,
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
