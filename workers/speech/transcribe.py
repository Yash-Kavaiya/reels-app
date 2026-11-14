"""Transcribes one media file with Faster Whisper and writes word timestamps as JSON.

Usage: python transcribe.py <input> <output.json> [--model small] [--language hi]

The language is detected automatically unless --language is given.
"""

import argparse
import json
import sys

from faster_whisper import WhisperModel


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default=None)
    args = parser.parse_args()

    # int8 on CPU runs everywhere; GPU support depends on the machine's CUDA libraries.
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        args.input,
        language=args.language,
        word_timestamps=True,
        vad_filter=True,
    )

    words = []
    for segment in segments:
        for word in segment.words or []:
            text = word.word.strip()
            if text:
                words.append(
                    {
                        "text": text,
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "probability": round(word.probability, 3),
                    }
                )

    result = {
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
        "durationSeconds": round(info.duration, 3),
        "words": words,
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
