#!/usr/bin/env python3
"""Expression model CLI tool.

Encode a performance into expression parameters, or decode expression
parameters back into a performed note sequence.

Usage:
    # Encode: extract expression from a recorded performance
    python scripts/expression_tool.py encode \\
        --score score.musicxml \\
        --performance recording.mid \\
        --alignment alignment.match \\
        -o expression_params.json

    # Decode: apply expression parameters to a score
    python scripts/expression_tool.py decode \\
        --score score.musicxml \\
        --params expression_params.json \\
        -o performed_notes.json

    # Apply: generate a score.json with expression-modelled velocities
    python scripts/expression_tool.py apply \\
        --score score.musicxml \\
        --params expression_params.json \\
        -o enriched.score.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import partitura as pt


def cmd_encode(args: argparse.Namespace) -> None:
    score = pt.load_score(str(args.score))
    performance = pt.load_performance_midi(str(args.performance))
    alignment = pt.load_match(str(args.alignment))

    if hasattr(alignment, "__iter__") and not isinstance(alignment, list):
        _, alignment_list = alignment
    elif isinstance(alignment, tuple) and len(alignment) >= 2:
        _, alignment_list = alignment[0], alignment[1]
    else:
        alignment_list = alignment

    params, snote_ids = pt.musicanalysis.encode_performance(
        score=score,
        performance=performance,
        alignment=alignment_list,
    )

    result = {
        "beat_period": params["beat_period"].tolist(),
        "velocity": params["velocity"].tolist(),
        "timing": params["timing"].tolist(),
        "articulation_log": params["articulation_log"].tolist(),
        "snote_ids": [str(sid) for sid in snote_ids],
    }

    _write_output(result, args.output)
    print(
        f"Encoded {len(snote_ids)} notes with expression parameters.",
        file=sys.stderr,
    )


def cmd_decode(args: argparse.Namespace) -> None:
    score = pt.load_score(str(args.score))

    with open(args.params) as f:
        params_data = json.load(f)

    param_len = len(params_data["beat_period"])
    param_array = np.zeros(
        param_len,
        dtype=[
            ("beat_period", "f4"),
            ("velocity", "f4"),
            ("timing", "f4"),
            ("articulation_log", "f4"),
        ],
    )
    param_array["beat_period"] = np.array(params_data["beat_period"], dtype="f4")
    param_array["velocity"] = np.array(params_data["velocity"], dtype="f4")
    param_array["timing"] = np.array(params_data["timing"], dtype="f4")
    param_array["articulation_log"] = np.array(
        params_data["articulation_log"], dtype="f4"
    )

    performed = pt.musicanalysis.decode_performance(
        score=score,
        parameters=param_array,
    )

    notes = _extract_performed_notes(performed)

    _write_output({"notes": notes}, args.output)
    print(f"Decoded {len(notes)} performed notes.", file=sys.stderr)


def cmd_apply(args: argparse.Namespace) -> None:
    """Apply expression parameters to a score, producing an enriched score.json."""
    from convert_score import convert_score

    score_json = convert_score(args.score)

    with open(args.params) as f:
        params_data = json.load(f)

    score_json["expressionParams"] = {
        "beat_period": params_data.get("beat_period", []),
        "velocity": params_data.get("velocity", []),
        "timing": params_data.get("timing", []),
        "articulation_log": params_data.get("articulation_log", []),
    }

    _write_output(score_json, args.output)
    print("Applied expression parameters to score JSON.", file=sys.stderr)


def _extract_performed_notes(performed) -> list[dict]:
    notes = []
    if hasattr(performed, "notes"):
        for n in performed.notes:
            if isinstance(n, dict):
                notes.append({
                    "pitch": int(n["pitch"]),
                    "onset_sec": float(n["note_on"]),
                    "duration_sec": float(n["note_off"] - n["note_on"]),
                    "velocity": int(n.get("velocity", 64)),
                })
            else:
                notes.append({
                    "pitch": n.midi_pitch,
                    "onset_sec": float(n.start.t),
                    "duration_sec": float(n.end.t - n.start.t),
                    "velocity": int(getattr(n, "velocity", 64)),
                })
    elif isinstance(performed, np.ndarray):
        for row in performed:
            notes.append({
                "pitch": int(row["pitch"]),
                "onset_sec": float(
                    row["onset_sec"] if "onset_sec" in row.dtype.names else 0.0
                ),
                "duration_sec": float(
                    row["duration_sec"] if "duration_sec" in row.dtype.names else 0.5
                ),
                "velocity": int(
                    row["velocity"] if "velocity" in row.dtype.names else 64
                ),
            })
    return notes


def _write_output(data: dict, output_path: Path | None) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text)
        print(f"Wrote {output_path}", file=sys.stderr)
    else:
        sys.stdout.write(text)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expression model CLI tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # encode
    enc = subparsers.add_parser("encode", help="Encode performance into expression params")
    enc.add_argument("--score", type=Path, required=True, help="MusicXML score file")
    enc.add_argument("--performance", type=Path, required=True, help="MIDI performance file")
    enc.add_argument("--alignment", type=Path, required=True, help="Alignment file (.match)")
    enc.add_argument("-o", "--output", type=Path, help="Output JSON file")

    # decode
    dec = subparsers.add_parser("decode", help="Decode expression params into performed notes")
    dec.add_argument("--score", type=Path, required=True, help="MusicXML score file")
    dec.add_argument("--params", type=Path, required=True, help="Expression params JSON")
    dec.add_argument("-o", "--output", type=Path, help="Output JSON file")

    # apply
    app = subparsers.add_parser("apply", help="Apply expression params to score JSON")
    app.add_argument("--score", type=Path, required=True, help="MusicXML score file")
    app.add_argument("--params", type=Path, required=True, help="Expression params JSON")
    app.add_argument("-o", "--output", type=Path, help="Output enriched score.json")

    args = parser.parse_args()

    commands = {"encode": cmd_encode, "decode": cmd_decode, "apply": cmd_apply}
    commands[args.command](args)


if __name__ == "__main__":
    main()
