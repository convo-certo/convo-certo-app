import tempfile
from pathlib import Path

import numpy as np
import partitura as pt
from fastapi import APIRouter, File, HTTPException, UploadFile

from convo_certo.models import (
    DecodeRequest,
    DecodeResponse,
    ExpressionParams,
    PerformedNote,
)

router = APIRouter()


def _load_from_bytes(data: bytes, suffix: str):
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        f.flush()
        tmp_path = Path(f.name)
    return tmp_path


@router.post("/encode", response_model=ExpressionParams)
async def encode_expression(
    score_file: UploadFile = File(...),
    performance_file: UploadFile = File(...),
    alignment_file: UploadFile = File(...),
):
    score_data = await score_file.read()
    perf_data = await performance_file.read()
    align_data = await alignment_file.read()

    score_path = _load_from_bytes(score_data, ".musicxml")
    perf_path = _load_from_bytes(perf_data, ".mid")
    align_path = _load_from_bytes(align_data, ".match")

    try:
        score = pt.load_score(str(score_path))
        performance = pt.load_performance_midi(str(perf_path))
        alignment = pt.load_match(str(align_path))

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

        return ExpressionParams(
            beat_period=params["beat_period"].tolist(),
            velocity=params["velocity"].tolist(),
            timing=params["timing"].tolist(),
            articulation_log=params["articulation_log"].tolist(),
            snote_ids=[str(sid) for sid in snote_ids],
        )
    except Exception as e:
        raise HTTPException(
            status_code=422, detail=f"Failed to encode performance: {e}"
        ) from None
    finally:
        score_path.unlink(missing_ok=True)
        perf_path.unlink(missing_ok=True)
        align_path.unlink(missing_ok=True)


@router.post("/decode", response_model=DecodeResponse)
async def decode_expression(
    score_file: UploadFile = File(...),
    params: DecodeRequest = None,
):
    score_data = await score_file.read()
    score_path = _load_from_bytes(score_data, ".musicxml")

    try:
        score = pt.load_score(str(score_path))

        if params is None:
            raise HTTPException(status_code=400, detail="Expression parameters required")

        param_len = len(params.beat_period)
        if param_len == 0:
            raise HTTPException(status_code=400, detail="Empty expression parameters")

        param_array = np.zeros(
            param_len,
            dtype=[
                ("beat_period", "f4"),
                ("velocity", "f4"),
                ("timing", "f4"),
                ("articulation_log", "f4"),
            ],
        )
        param_array["beat_period"] = np.array(params.beat_period, dtype="f4")
        param_array["velocity"] = np.array(params.velocity, dtype="f4")
        param_array["timing"] = np.array(params.timing, dtype="f4")
        param_array["articulation_log"] = np.array(params.articulation_log, dtype="f4")

        performed = pt.musicanalysis.decode_performance(
            score=score,
            parameters=param_array,
        )

        notes = []
        if hasattr(performed, "notes"):
            for n in performed.notes:
                notes.append(
                    PerformedNote(
                        pitch=n["pitch"] if isinstance(n, dict) else n.midi_pitch,
                        onset_sec=float(n["note_on"] if isinstance(n, dict) else n.start.t),
                        duration_sec=float(
                            (n["note_off"] - n["note_on"])
                            if isinstance(n, dict)
                            else (n.end.t - n.start.t)
                        ),
                        velocity=int(n["velocity"] if isinstance(n, dict) else 64),
                    )
                )
        elif isinstance(performed, np.ndarray):
            for row in performed:
                notes.append(
                    PerformedNote(
                        pitch=int(row["pitch"]),
                        onset_sec=(
                            float(row["onset_sec"])
                            if "onset_sec" in row.dtype.names
                            else 0.0
                        ),
                        duration_sec=(
                            float(row["duration_sec"])
                            if "duration_sec" in row.dtype.names
                            else 0.5
                        ),
                        velocity=(
                            int(row["velocity"])
                            if "velocity" in row.dtype.names
                            else 64
                        ),
                    )
                )

        return DecodeResponse(notes=notes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=422, detail=f"Failed to decode performance: {e}"
        ) from None
    finally:
        score_path.unlink(missing_ok=True)
