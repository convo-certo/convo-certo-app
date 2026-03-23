from pydantic import BaseModel, Field


class TempoEventOut(BaseModel):
    beat_position: float
    bpm: float
    type: str = Field(pattern=r"^(instant|continuous)$")
    end_beat_position: float | None = None
    end_bpm: float | None = None


class NoteOut(BaseModel):
    pitch: int
    onset_beat: float
    duration_beat: float
    velocity: int
    part_index: int
    part_name: str


class PartInfo(BaseModel):
    index: int
    id: str
    name: str
    note_count: int


class TimeSignatureOut(BaseModel):
    numerator: int
    denominator: int


class ScoreParseResponse(BaseModel):
    title: str
    tempo: float
    time_signature: TimeSignatureOut
    parts: list[PartInfo]
    notes: list[NoteOut]
    tempo_events: list[TempoEventOut]
    total_measures: int
    total_beats: float


class NoteArrayResponse(BaseModel):
    notes: list[NoteOut]
    fields: list[str]


class ExpressionParams(BaseModel):
    beat_period: list[float]
    velocity: list[float]
    timing: list[float]
    articulation_log: list[float]
    snote_ids: list[str]


class PerformedNote(BaseModel):
    pitch: int
    onset_sec: float
    duration_sec: float
    velocity: int


class DecodeRequest(BaseModel):
    beat_period: list[float]
    velocity: list[float]
    timing: list[float]
    articulation_log: list[float]


class DecodeResponse(BaseModel):
    notes: list[PerformedNote]
