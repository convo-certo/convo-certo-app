from __future__ import annotations

import argparse
from pathlib import Path

from music21 import converter


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a local MIDI file to MusicXML for inspection")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--clarinet-bb", action="store_true")
    args = parser.parse_args()
    score = converter.parse(str(args.input))
    if args.clarinet_bb and score.parts:
        clarinet = next(
            (part for part in score.parts if "clarinet" in (part.partName or "").lower()),
            score.parts[0],
        )
        clarinet.transpose("M2", inPlace=True)
        clarinet.partName = "Clarinet in B-flat"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    score.write("musicxml", fp=str(args.output))
    print(f"{args.input} -> {args.output}: {len(score.parts)} parts")


if __name__ == "__main__":
    main()
