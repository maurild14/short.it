"""Local CPU transcription fallback for downloaded reference videos."""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error("The source video does not exist.")
    try:
        from faster_whisper import WhisperModel

        print("Transcribing locally with faster-whisper base (CPU int8). First use downloads the model.", flush=True)
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, info = model.transcribe(str(args.source), beam_size=5, vad_filter=True)
        rows = [{"start": segment.start, "end": segment.end, "text": segment.text.strip()} for segment in segments]
        text = "\n".join(row["text"] for row in rows if row["text"])
        args.output.write_text(text + ("\n" if text else ""), encoding="utf-8")
        args.output.with_suffix(".json").write_text(json.dumps({"language": info.language, "duration": info.duration, "model": "faster-whisper-base", "segments": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Local transcription complete: {len(rows)} segments.", flush=True)
    except Exception as error:
        print(f"Local faster-whisper transcription failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
