import tempfile
from pathlib import Path

import partitura as pt
from fastapi import APIRouter, File, HTTPException, UploadFile

from convo_certo.models import (
    NoteArrayResponse,
    NoteOut,
    PartInfo,
    ScoreParseResponse,
    TempoEventOut,
    TimeSignatureOut,
)

router = APIRouter()


def _load_score_from_bytes(data: bytes) -> pt.score.Score:
    with tempfile.NamedTemporaryFile(suffix=".musicxml", delete=False) as f:
        f.write(data)
        f.flush()
        tmp_path = Path(f.name)

    try:
        return pt.load_score(str(tmp_path))
    finally:
        tmp_path.unlink(missing_ok=True)


def _extract_tempo(score: pt.score.Score) -> tuple[float, list[TempoEventOut]]:
    default_tempo = 120.0
    tempo_events: list[TempoEventOut] = []

    for part in score.parts:
        for tempo_dir in part.iter_all(pt.score.Tempo):
            beat_pos = part.beat_map(tempo_dir.start.t)
            default_tempo = tempo_dir.bpm
            tempo_events.append(
                TempoEventOut(
                    beat_position=float(beat_pos),
                    bpm=float(tempo_dir.bpm),
                    type="instant",
                )
            )
        break

    if not tempo_events:
        tempo_events.append(
            TempoEventOut(beat_position=0.0, bpm=default_tempo, type="instant")
        )

    return default_tempo, tempo_events


def _extract_time_signature(score: pt.score.Score) -> TimeSignatureOut:
    for part in score.parts:
        for ts in part.iter_all(pt.score.TimeSignature):
            return TimeSignatureOut(numerator=ts.beats, denominator=ts.beat_type)
    return TimeSignatureOut(numerator=4, denominator=4)


DYNAMICS_VELOCITY_MAP: dict[str, int] = {
    "pppp": 16, "ppp": 24, "pp": 36, "p": 49, "mp": 64,
    "mf": 80, "f": 96, "ff": 112, "fff": 120, "ffff": 127,
    "sfz": 112, "sf": 112, "fp": 96, "fz": 112,
}

DEFAULT_VELOCITY = 80


class _DynamicsResolver:
    def __init__(self, part):
        self._constant: list[tuple[int, int]] = []
        self._ramps: list[tuple[int, int, int, int]] = []

        for dyn in part.iter_all(pt.score.Dynamic):
            vel = getattr(dyn, "velocity", None)
            if vel is not None:
                self._constant.append((dyn.start.t, int(round(vel))))

        for cld in part.iter_all(pt.score.ConstantLoudnessDirection):
            text = getattr(cld, "text", "")
            if text and text.lower() in DYNAMICS_VELOCITY_MAP:
                self._constant.append((cld.start.t, DYNAMICS_VELOCITY_MAP[text.lower()]))

        self._constant.sort(key=lambda e: e[0])
        seen: set[int] = set()
        unique: list[tuple[int, int]] = []
        for t_val, v in self._constant:
            if t_val not in seen:
                seen.add(t_val)
                unique.append((t_val, v))
        self._constant = unique

        for inc in part.iter_all(pt.score.IncreasingLoudnessDirection):
            if inc.end is None:
                continue
            start_vel = self._base_velocity_at(inc.start.t)
            end_vel = self._next_velocity_after(inc.end.t, start_vel + 20)
            self._ramps.append((inc.start.t, inc.end.t, start_vel, end_vel))

        for dec in part.iter_all(pt.score.DecreasingLoudnessDirection):
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
        for t_val, v in self._constant:
            if t_val <= time_point:
                active = v
            else:
                break
        return active

    def _next_velocity_after(self, time_point: int, fallback: int) -> int:
        for t_val, v in self._constant:
            if t_val >= time_point:
                return v
        return fallback


def _extract_notes(score: pt.score.Score) -> list[NoteOut]:
    notes: list[NoteOut] = []
    for part_idx, part in enumerate(score.parts):
        beat_map = part.beat_map
        dynamics = _DynamicsResolver(part)
        for note in part.notes_tied:
            onset_beat = float(beat_map(note.start.t))
            offset_beat = float(beat_map(note.end_tied.t))
            duration_beat = offset_beat - onset_beat

            notes.append(
                NoteOut(
                    pitch=note.midi_pitch,
                    onset_beat=onset_beat,
                    duration_beat=max(duration_beat, 0.01),
                    velocity=dynamics.velocity_at(note.start.t),
                    part_index=part_idx,
                    part_name=part.part_name or f"Part {part_idx + 1}",
                )
            )

    notes.sort(key=lambda n: (n.onset_beat, n.pitch))
    return notes


@router.post("/parse", response_model=ScoreParseResponse)
async def parse_score(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xml", ".musicxml", ".mxl")):
        raise HTTPException(status_code=400, detail="File must be MusicXML (.xml, .musicxml, .mxl)")

    data = await file.read()
    try:
        score = _load_score_from_bytes(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse MusicXML: {e}") from None

    default_tempo, tempo_events = _extract_tempo(score)
    time_sig = _extract_time_signature(score)
    notes = _extract_notes(score)

    parts = []
    for idx, part in enumerate(score.parts):
        part_notes = [n for n in notes if n.part_index == idx]
        parts.append(
            PartInfo(
                index=idx,
                id=part.id or f"P{idx + 1}",
                name=part.part_name or f"Part {idx + 1}",
                note_count=len(part_notes),
            )
        )

    total_measures = 0
    for part in score.parts:
        measures = list(part.iter_all(pt.score.Measure))
        total_measures = max(total_measures, len(measures))

    total_beats = max((n.onset_beat + n.duration_beat for n in notes), default=0.0)

    return ScoreParseResponse(
        title=(
            getattr(score, "work_title", None)
            or getattr(score, "movement_title", None)
            or "Untitled"
        ),
        tempo=default_tempo,
        time_signature=time_sig,
        parts=parts,
        notes=notes,
        tempo_events=tempo_events,
        total_measures=total_measures,
        total_beats=total_beats,
    )


@router.post("/note-array", response_model=NoteArrayResponse)
async def note_array(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xml", ".musicxml", ".mxl")):
        raise HTTPException(status_code=400, detail="File must be MusicXML")

    data = await file.read()
    try:
        score = _load_score_from_bytes(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse MusicXML: {e}") from None

    notes = _extract_notes(score)
    fields = list(NoteOut.model_fields.keys())

    return NoteArrayResponse(notes=notes, fields=fields)
