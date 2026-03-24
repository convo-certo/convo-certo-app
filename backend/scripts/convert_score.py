#!/usr/bin/env python3
"""Convert MusicXML files to JSON using partitura for precise parsing.

Outputs ParsedScore-compatible JSON that the frontend can directly consume,
including dynamics-aware velocity values derived from partitura's analysis.

Usage:
    python scripts/convert_score.py <input.musicxml> [output.json]
    python scripts/convert_score.py --all <scores_dir> [output_dir]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import partitura as pt
import partitura.score as pts


DYNAMICS_VELOCITY_MAP: dict[str, int] = {
    "pppp": 16,
    "ppp": 24,
    "pp": 36,
    "p": 49,
    "mp": 64,
    "mf": 80,
    "f": 96,
    "ff": 112,
    "fff": 120,
    "ffff": 127,
    "sfz": 112,
    "sf": 112,
    "fp": 96,
    "fz": 112,
}

DEFAULT_VELOCITY = 80  # mf


class DynamicsResolver:
    """Resolves velocity at any time point, handling constant dynamics and gradual ramps."""

    def __init__(self, part: pts.Part):
        self._constant: list[tuple[int, int]] = []
        self._ramps: list[tuple[int, int, int, int]] = []  # (start_t, end_t, start_vel, end_vel)

        for dyn in part.iter_all(pts.Dynamic):
            vel = getattr(dyn, "velocity", None)
            if vel is not None:
                self._constant.append((dyn.start.t, int(round(vel))))

        for cld in part.iter_all(pts.ConstantLoudnessDirection):
            text = getattr(cld, "text", "")
            if text and text.lower() in DYNAMICS_VELOCITY_MAP:
                self._constant.append((cld.start.t, DYNAMICS_VELOCITY_MAP[text.lower()]))

        self._constant.sort(key=lambda e: e[0])
        seen: set[int] = set()
        unique: list[tuple[int, int]] = []
        for t, v in self._constant:
            if t not in seen:
                seen.add(t)
                unique.append((t, v))
        self._constant = unique

        for inc in part.iter_all(pts.IncreasingLoudnessDirection):
            if inc.end is None:
                continue
            start_vel = self._base_velocity_at(inc.start.t)
            end_vel = self._next_velocity_after(inc.end.t, start_vel + 20)
            self._ramps.append((inc.start.t, inc.end.t, start_vel, end_vel))

        for dec in part.iter_all(pts.DecreasingLoudnessDirection):
            if dec.end is None:
                continue
            start_vel = self._base_velocity_at(dec.start.t)
            end_vel = self._next_velocity_after(dec.end.t, max(start_vel - 20, 20))
            self._ramps.append((dec.start.t, dec.end.t, start_vel, end_vel))

        self._ramps.sort(key=lambda r: r[0])

    def velocity_at(self, time_point: int) -> int:
        for start_t, end_t, start_vel, end_vel in self._ramps:
            if start_t <= time_point <= end_t:
                duration = end_t - start_t
                if duration <= 0:
                    return start_vel
                progress = (time_point - start_t) / duration
                return int(round(start_vel + (end_vel - start_vel) * progress))

        return self._base_velocity_at(time_point)

    def _base_velocity_at(self, time_point: int) -> int:
        active = DEFAULT_VELOCITY
        for t, v in self._constant:
            if t <= time_point:
                active = v
            else:
                break
        return active

    def _next_velocity_after(self, time_point: int, fallback: int) -> int:
        for t, v in self._constant:
            if t >= time_point:
                return v
        return fallback


def _extract_tempo(score: pt.score.Score) -> tuple[float, list[dict]]:
    default_tempo = 120.0
    tempo_events: list[dict] = []

    for part in score.parts:
        for tempo_dir in part.iter_all(pts.Tempo):
            beat_pos = part.beat_map(tempo_dir.start.t)
            default_tempo = tempo_dir.bpm
            tempo_events.append({
                "beatPosition": float(beat_pos),
                "bpm": float(tempo_dir.bpm),
                "type": "instant",
            })
        break

    if not tempo_events:
        tempo_events.append({"beatPosition": 0.0, "bpm": default_tempo, "type": "instant"})

    return default_tempo, tempo_events


def _extract_time_signature(score: pt.score.Score) -> dict:
    for part in score.parts:
        for ts in part.iter_all(pts.TimeSignature):
            return {"beats": ts.beats, "beatType": ts.beat_type}
    return {"beats": 4, "beatType": 4}


def _extract_time_signature_changes(
    score: pt.score.Score,
) -> list[dict]:
    changes: list[dict] = []
    initial_found = False
    for part in score.parts:
        for ts in part.iter_all(pts.TimeSignature):
            if not initial_found:
                initial_found = True
                continue
            beat_pos = float(part.beat_map(ts.start.t))
            changes.append({
                "beatPosition": beat_pos,
                "beats": ts.beats,
                "beatType": ts.beat_type,
            })
        break
    return changes


def convert_score(musicxml_path: Path) -> dict:
    score = pt.load_score(str(musicxml_path))

    default_tempo, tempo_events = _extract_tempo(score)
    time_sig = _extract_time_signature(score)
    ts_changes = _extract_time_signature_changes(score)

    parts_out: list[dict] = []
    total_measures = 0
    measure_numbers: list[int] = []
    measure_beats_list: list[int] = []

    for part_idx, part in enumerate(score.parts):
        beat_map = part.beat_map
        dynamics = DynamicsResolver(part)

        transpose_chromatic = 0
        for t in part.iter_all(pts.Transposition):
            transpose_chromatic = t.chromatic
            break

        notes: list[dict] = []
        for note in part.notes_tied:
            onset_beat = float(beat_map(note.start.t))
            offset_beat = float(beat_map(note.end_tied.t))
            duration_beat = max(offset_beat - onset_beat, 0.01)
            velocity = dynamics.velocity_at(note.start.t)

            notes.append({
                "pitch": note.midi_pitch + transpose_chromatic,
                "startBeat": onset_beat,
                "durationBeats": duration_beat,
                "velocity": velocity,
                "partIndex": part_idx,
            })

        notes.sort(key=lambda n: (n["startBeat"], n["pitch"]))

        measures = list(part.iter_all(pts.Measure))
        if len(measures) > total_measures:
            total_measures = len(measures)

        if part_idx == 0:
            measure_numbers = [
                getattr(m, "number", i + 1) or i + 1 for i, m in enumerate(measures)
            ]
            current_beats = time_sig["beats"]
            ts_change_idx = 0
            for m in measures:
                m_beat = float(beat_map(m.start.t))
                while ts_change_idx < len(ts_changes) and ts_changes[ts_change_idx]["beatPosition"] <= m_beat:
                    current_beats = ts_changes[ts_change_idx]["beats"]
                    ts_change_idx += 1
                measure_beats_list.append(current_beats)

        parts_out.append({
            "id": part.id or f"P{part_idx + 1}",
            "name": part.part_name or f"Part {part_idx + 1}",
            "isSolo": part_idx == 0,
            "notes": notes,
        })

    all_notes = [n for p in parts_out for n in p["notes"]]
    total_beats = max(
        (n["startBeat"] + n["durationBeats"] for n in all_notes), default=0.0
    )
    playback_order = list(range(len(measure_numbers)))

    measure_start_beats: list[float] = []
    running = 0.0
    for i in range(len(playback_order)):
        measure_start_beats.append(running)
        slot = playback_order[i]
        running += measure_beats_list[slot] if slot < len(measure_beats_list) else time_sig["beats"]

    title = (
        getattr(score, "work_title", None)
        or getattr(score, "movement_title", None)
        or "Untitled"
    )

    return {
        "title": title,
        "tempo": default_tempo,
        "timeSignature": time_sig,
        "parts": parts_out,
        "measures": [],
        "totalMeasures": total_measures,
        "totalBeats": total_beats,
        "playbackOrder": playback_order,
        "measureNumbers": measure_numbers,
        "measureStartBeats": measure_start_beats,
        "timeSignatureChanges": ts_changes,
        "tempoEvents": tempo_events,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert MusicXML to ParsedScore JSON")
    parser.add_argument("input", help="MusicXML file or directory (with --all)")
    parser.add_argument("output", nargs="?", help="Output JSON file or directory")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Convert all MusicXML files in the input directory",
    )
    args = parser.parse_args()

    if args.all:
        input_dir = Path(args.input)
        output_dir = Path(args.output) if args.output else input_dir
        output_dir.mkdir(parents=True, exist_ok=True)

        files = sorted(
            f
            for f in input_dir.iterdir()
            if f.suffix.lower() in (".xml", ".musicxml", ".mxl")
        )
        if not files:
            print(f"No MusicXML files found in {input_dir}", file=sys.stderr)
            sys.exit(1)

        for f in files:
            out_path = output_dir / f"{f.stem}.score.json"
            print(f"  {f.name} -> {out_path.name}", file=sys.stderr)
            data = convert_score(f)
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

        print(f"Converted {len(files)} files.", file=sys.stderr)

    else:
        input_path = Path(args.input)
        if not input_path.exists():
            print(f"File not found: {input_path}", file=sys.stderr)
            sys.exit(1)

        data = convert_score(input_path)

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            print(f"Wrote {out_path}", file=sys.stderr)
        else:
            json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
            print()


if __name__ == "__main__":
    main()
