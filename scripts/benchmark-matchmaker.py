# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "pymatchmaker @ git+https://github.com/pymatchmaker/matchmaker@40fd6e7602bd9e596cea1beafdcee4853b9f2c98",
# ]
# ///

import argparse
from copy import deepcopy
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import time

import numpy as np
from matchmaker.prob.hmm import PitchIOIHMM
from matchmaker.dp.oltw_arzt import OnlineTimeWarpingArztEvent
from matchmaker.dp.oltw_dixon import OnlineTimeWarpingDixonEvent
from matchmaker.utils.tempo_models import KalmanTempoModel


REVISION = "40fd6e7602bd9e596cea1beafdcee4853b9f2c98"


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(data):
    notes, inputs, tempo = data["notes"], data["inputs"], data["tempo"]
    if not finite(tempo) or tempo <= 0:
        raise ValueError("Tempo must be positive and finite")
    if not 1 <= len(notes) <= 2048 or len(inputs) > 100000:
        raise ValueError("Research adapter accepts 1–2048 score notes and at most 100000 inputs")
    for note in notes:
        if not finite(note["startBeat"]) or type(note["pitch"]) is not int or not 0 <= note["pitch"] <= 127:
            raise ValueError("Invalid score beat or MIDI pitch")
    previous = -math.inf
    for item in inputs:
        message = item["message"]
        if message["type"] != "noteon" or not finite(message["velocity"]) or not 0 < message["velocity"] <= 127:
            raise ValueError("Expected audible note onsets")
        if type(message["note"]) is not int or not 0 <= message["note"] <= 127:
            raise ValueError("Invalid input MIDI pitch")
        if not finite(message["timestamp"]) or message["timestamp"] <= previous:
            raise ValueError("Monophonic input timestamps must increase strictly")
        previous = message["timestamp"]
        if not finite(item["expectedBeat"]) or (item["targetBeat"] is not None and not finite(item["targetBeat"])):
            raise ValueError("Invalid evaluation beat")


def percentile(values, quantile):
    return sorted(values)[max(0, math.ceil(len(values) * quantile) - 1)] if values else None


def evaluate(data, method="hmm"):
    validate(data)
    notes = np.array([(n["pitch"], n["startBeat"]) for n in data["notes"]], dtype=[("pitch", "i4"), ("onset_beat", "f8")])

    def tempo_factory(**kwargs):
        return KalmanTempoModel(**{**kwargs, "init_beat_period": 60 / data["tempo"]})

    start = time.perf_counter_ns()
    if method == "hmm":
        tracker = PitchIOIHMM(reference_features=notes, tempo_model=tempo_factory, has_insertions=False, piano_range=False)
    else:
        positions = np.unique(notes["onset_beat"])
        reference = np.zeros((len(positions), 128), dtype=np.float32)
        for note in notes:
            reference[np.searchsorted(positions, note["onset_beat"]), note["pitch"]] = 1
        classes = {"arzt": OnlineTimeWarpingArztEvent, "dixon": OnlineTimeWarpingDixonEvent}
        tracker = classes[method](reference_features=reference, score_positions=positions, window_size=30, distance_func="cosine")
    initialization_ms = (time.perf_counter_ns() - start) / 1e6
    outcomes, processing, errors = [], [], []
    counts = dict(correct=0, missed=0, wrongPosition=0, falseMatch=0, rejectedExtra=0)
    origin = data["inputs"][0]["message"]["timestamp"] if data["inputs"] else 0
    for item in data["inputs"]:
        message, target = item["message"], item["targetBeat"]
        if method == "hmm":
            features = np.array([message["note"]], dtype=np.int32)
        else:
            features = np.zeros(128, dtype=np.float32)
            features[message["note"]] = 1
        perf_time = (message["timestamp"] - origin) / 1000
        start = time.perf_counter_ns()
        beat = float(tracker(features, perf_time))
        processing.append((time.perf_counter_ns() - start) / 1e6)
        if not math.isfinite(beat):
            raise ValueError("Matchmaker returned a non-finite beat")
        if target is None:
            outcome = "falseMatch"
        else:
            error = abs(beat - target)
            errors.append(error)
            outcome = "correct" if error <= 0.0001 else "wrongPosition"
        counts[outcome] += 1
        outcomes.append(dict(timestamp=message["timestamp"], targetBeat=target, matchedBeat=beat, outcome=outcome))
    labeled = counts["correct"] + counts["missed"] + counts["wrongPosition"]
    return dict(
        **counts, inputCount=len(outcomes), labeledNotes=labeled,
        extraNotes=counts["falseMatch"] + counts["rejectedExtra"],
        accuracy=counts["correct"] / labeled if labeled else None,
        matchedPositionErrorBeats=dict(p50=percentile(errors, .5), p95=percentile(errors, .95)),
        processingMs=dict(p50=percentile(processing, .5), p95=percentile(processing, .95)),
        initializationMs=initialization_ms, outcomes=outcomes,
    )



def self_test():
    data = dict(
        tempo=120,
        notes=[dict(pitch=pitch, startBeat=i * .5) for i, pitch in enumerate([48, 50, 52, 53, 55, 57])],
        inputs=[dict(message=dict(type="noteon", note=pitch, velocity=80, timestamp=i * 250), expectedBeat=i * .5, targetBeat=i * .5) for i, pitch in enumerate([48, 50, 52, 53, 55, 57])],
    )
    def positions(result):
        return [item["matchedBeat"] for item in result["outcomes"]]
    for method in ["hmm", "arzt", "dixon"]:
        baseline = positions(evaluate(data, method))
        assert baseline == [i * .5 for i in range(6)], (method, baseline)
        relabeled = deepcopy(data)
        for item in relabeled["inputs"]:
            item["targetBeat"] = 999
            item["expectedBeat"] = 999
        assert positions(evaluate(relabeled, method)) == baseline, method
        prefix = deepcopy(data)
        prefix["inputs"] = prefix["inputs"][:3]
        assert positions(evaluate(prefix, method)) == baseline[:3], method
        for shift in [-48, 70]:
            shifted = deepcopy(data)
            for note in shifted["notes"]:
                note["pitch"] += shift
            for item in shifted["inputs"]:
                item["message"]["note"] += shift
                item["message"]["timestamp"] += 123456
            assert positions(evaluate(shifted, method)) == baseline, method
    invalid = deepcopy(data)
    invalid["inputs"][1]["message"]["timestamp"] = 0
    try:
        validate(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("Duplicate timestamps must be rejected")
    print("Passed: exact beat mapping, label independence, causal prefixes, pitch/time translation for 3 trackers; stale input rejection")


def main():
    parser = argparse.ArgumentParser(description="Replay ConvoCerto labeled inputs through pinned Matchmaker MIDI trackers, without devices or a server")
    parser.add_argument("report", type=Path, nargs="?")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.report is None:
        parser.error("report is required unless --self-test is used")
    source = args.report.read_bytes()
    report = json.loads(source)
    if not isinstance(report.get("results"), list) or not 1 <= len(report["results"]) <= 100:
        raise ValueError("Expected a follower report with 1–100 scenarios")
    for scenario in report["results"]:
        validate(scenario["input"])
    distribution = importlib.metadata.distribution("pymatchmaker")
    direct = json.loads(distribution.read_text("direct_url.json") or "{}")
    if direct.get("vcs_info", {}).get("commit_id") != REVISION:
        raise ValueError("Run with uv run --script to use the pinned Matchmaker revision")
    output = dict(
        revision=REVISION, sourceSha256=hashlib.sha256(source).hexdigest(),
        python=platform.python_version(), platform=platform.platform(),
        dependencies=sorted(f"{d.metadata['Name']}=={d.version}" for d in importlib.metadata.distributions()),
        configuration=dict(
            hmm=dict(tracker="PitchIOIHMM", tempo="KalmanTempoModel initialized from scenario tempo", hasInsertions=False, pianoRange=False),
            arzt=dict(tracker="OnlineTimeWarpingArztEvent", features="128-bin onset pitch vector", distance="cosine", windowSize=30, stepSize=5, startWindowSize=5),
            dixon=dict(tracker="OnlineTimeWarpingDixonEvent", features="128-bin onset pitch vector", distance="cosine", windowSize=30),
        ),
        limitations=[
            "Synthetic monophonic open-loop component evaluation; no device, sound rendering, chord buffering or artist data",
            "No target labels or expectedBeat supplied to Matchmaker; each scenario starts at the score beginning",
            "External trackers emit a position on every input; extra-note outputs count as falseMatch, not a claim of onset detection",
            "Event-level symbolic OLTW is not the audio/chroma configuration evaluated in the ISMIR 2025 paper",
            "OLTW produces position, not adaptive tempo; no end-to-end accompaniment comparison is implied",
            "CPU timings exclude initialization and are not comparable to end-to-end MIDI/audio latency",
        ],
        results=[dict(scenario=s["scenario"], matchmaker=evaluate(s["input"]), arzt=evaluate(s["input"], "arzt"), dixon=evaluate(s["input"], "dixon")) for s in report["results"]],
    )
    destination = args.report.with_name("matchmaker.json")
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    for result in output["results"]:
        for method in ["matchmaker", "arzt", "dixon"]:
            score = result[method]
            print(f"{result['scenario']} {method}: {score['correct']}/{score['labeledNotes']}; wrong={score['wrongPosition']}, extra={score['falseMatch']}")
    print(destination)


if __name__ == "__main__":
    main()
