from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / ".repertoire-cache" / "PDMX.csv"
OUT_PATH = ROOT / "docs" / "research" / "pdmx-wind-candidates.json"
PUBLIC_OUT_PATH = ROOT / "public" / "repertoire" / "ensemble" / "pdmx-wind-candidates.json"
TERMS = ("military band", "wind ensemble", "woodwind", "brass", "march", "water music", "folk song suite")
HISTORICAL_COMPOSERS = ("bach", "handel", "clarke", "holst", "elgar", "sousa", "fucik", "fučík", "alford", "lully", "mozart", "beethoven", "grieg", "dvor")


def main() -> None:
    if not CSV_PATH.exists():
        raise SystemExit(".repertoire-cache/PDMX.csv is missing; run ensemble:prepare first")
    candidates = []
    with CSV_PATH.open(newline="") as stream:
        for row in csv.DictReader(stream):
            text = " ".join(row.get(key, "") for key in ("song_name", "title", "subtitle", "tags")).lower()
            if not any(term in text for term in TERMS) or int(row.get("n_tracks") or 0) < 5:
                continue
            eligible = row["license"] in {"cc-zero", "publicdomain"} and row["license_conflict"] == "False" and row["has_paywall"] == "False" and row["subset:all_valid"] == "True"
            review_status = "metadata-eligible-manual-review" if eligible else "reject-until-rights-resolved"
            candidates.append({
                "songName": row.get("song_name", ""),
                "title": row.get("title", ""),
                "composer": row.get("composer_name", ""),
                "tracks": int(row["n_tracks"]),
                "license": row["license"],
                "licenseConflict": row["license_conflict"] == "True",
                "hasPaywall": row["has_paywall"] == "True",
                "allValid": row["subset:all_valid"] == "True",
                "metadataEligible": eligible,
                "manualReviewRequired": True,
                "reviewStatus": review_status,
                "historicalComposerSignal": any(name in row.get("composer_name", "").lower() for name in HISTORICAL_COMPOSERS),
                "mxlPath": row["mxl"],
            })
    candidates.sort(key=lambda item: (-item["historicalComposerSignal"], -item["metadataEligible"], -item["tracks"], item["title"]))
    report = json.dumps({"generatedFrom": "PDMX.csv", "rightsNote": "Metadata eligibility is not a copyright determination; every row requires manual work, edition, and arrangement review.", "candidates": candidates[:100]}, ensure_ascii=False, indent=2) + "\n"
    OUT_PATH.write_text(report)
    PUBLIC_OUT_PATH.write_text(report)
    print(f"Wrote {min(100, len(candidates))} wind candidates to {OUT_PATH}")


if __name__ == "__main__":
    main()
