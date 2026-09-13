import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("benchmark_matchmaker", Path(__file__).with_name("benchmark-matchmaker.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
evaluate, validate = adapter.evaluate, adapter.validate


def fixture():
    pitches = [60, 62, 64, 65]
    return dict(tempo=120, notes=[dict(pitch=p, startBeat=i) for i, p in enumerate(pitches)], inputs=[
        dict(message=dict(type="noteon", note=p, timestamp=i * 500, velocity=80), expectedBeat=i, targetBeat=i)
        for i, p in enumerate(pitches)
    ])


class MatchmakerAdapterTests(unittest.TestCase):
    def test_real_tracker_and_label_independence(self):
        original = fixture()
        baseline = evaluate(original)
        self.assertEqual(baseline["correct"], 4)
        self.assertEqual(baseline["wrongPosition"], 0)
        changed = copy.deepcopy(original)
        for item in changed["inputs"]:
            item["targetBeat"] += 100
            item["expectedBeat"] -= 100
        rerun = evaluate(changed)
        self.assertEqual(rerun["correct"], 0)
        self.assertEqual(rerun["wrongPosition"], 4)
        self.assertEqual([x["matchedBeat"] for x in baseline["outcomes"]], [x["matchedBeat"] for x in rerun["outcomes"]])

    def test_extra_note_outputs_are_not_counted_as_success(self):
        data = fixture()
        data["inputs"][1]["targetBeat"] = None
        result = evaluate(data)
        self.assertEqual(result["labeledNotes"], 3)
        self.assertEqual(result["extraNotes"], 1)
        self.assertEqual(result["falseMatch"], 1)

    def test_empty_performance_has_no_accuracy_or_latency(self):
        data = fixture()
        data["inputs"] = []
        result = evaluate(data)
        self.assertIsNone(result["accuracy"])
        self.assertIsNone(result["processingMs"]["p95"])

    def test_malformed_and_unbounded_inputs_rejected(self):
        cases = []
        data = fixture(); data["tempo"] = float("nan"); cases.append(data)
        data = fixture(); data["notes"] *= 1000; cases.append(data)
        data = fixture(); data["inputs"][1]["message"]["timestamp"] = 0; cases.append(data)
        data = fixture(); data["inputs"][1]["message"]["note"] = 128; cases.append(data)
        data = fixture(); data["inputs"][1]["targetBeat"] = float("inf"); cases.append(data)
        for data in cases:
            with self.subTest(data=data["tempo"]), self.assertRaises(ValueError):
                validate(data)


if __name__ == "__main__":
    unittest.main()
