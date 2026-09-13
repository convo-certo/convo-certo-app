from __future__ import annotations

import csv
from datetime import date
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".repertoire-cache"
OUT = ROOT / "public/repertoire/ensemble"
SCORES = [
    ("mozart-k622-1", 196564, "QmfAnXUsFrLJi8z6AAXHM8C6BYXpytpJJNsGnRXcC8UWTu", "Mozart · Clarinet Concerto K.622 · I. Allegro"),
    ("mozart-k622-3", 152191, "QmQeWBCgzBcp6AC5zh4kMMqJsAv4MBarbkVLfuq9s1dVYJ", "Mozart · Clarinet Concerto K.622 · III. Rondo"),
    ("beethoven-op73-2", 105118, "QmR6ezJ8wcD8QLcuDF5AEDvWEgo8ZPsvLXyz2utomZQntc", "Beethoven · Piano Concerto No.5 Op.73 · II. Adagio un poco mosso"),
    ("mozart-k622-2", 9239, "QmbUn1kSCXgwKEBqk8w4AjF6X1yUnNfzzLEedyvE4HAGUN", "Mozart · Clarinet Concerto K.622 · II. Adagio"),
]
SELECTION = json.loads((ROOT / "scripts/ensemble-selection.json").read_text())
SCORES += [(item["id"], item["scorebaseId"], item["stem"], item["title"]) for item in SELECTION]
LOCAL_SOURCES = {item["id"]: item for item in SELECTION if item.get("localSource")}
DATASET = "https://zenodo.org/records/15571083"


def fetch(url: str, path: Path) -> None:
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".partial")
        subprocess.run(["curl", "-L", "--fail", "--max-time", "900", "-s", url, "-o", str(temporary)], check=True)
        temporary.replace(path)


def main() -> None:
    CACHE.mkdir(exist_ok=True)
    (CACHE / "ensemble").mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    csv_path = CACHE / "PDMX.csv"
    fetch(DATASET + "/files/PDMX.csv?download=1", csv_path)
    wanted = {item[2] for item in SCORES}
    rows = {}
    with csv_path.open() as stream:
        for row in csv.DictReader(stream):
            stem = Path(row["path"]).stem
            if stem in wanted:
                rows[stem] = row
    manifest = []
    for name, scorebase_id, stem, title in SCORES:
        local = LOCAL_SOURCES.get(name)
        if local:
            row = {"license": "publicdomain", "license_conflict": "False", "has_paywall": "False", "subset:all_valid": "True", "composer_name": "Wolfgang Amadeus Mozart", "metadata": "Mutopia Project entry 337", "mxl": local["localSource"]}
            xml = (ROOT / local["localSource"]).read_bytes()
        else:
            row = rows.get(stem)
            if not row or row["license"] not in {"cc-zero", "publicdomain"} or row["license_conflict"] != "False" or row["has_paywall"] != "False" or row["subset:all_valid"] != "True":
                raise ValueError(f"Verified, nonconflicting public-domain metadata is required: {stem}")
            url = f"https://scorebase.org/scores/{scorebase_id}/file/mxl?download=true"
            archive = CACHE / "ensemble" / f"{scorebase_id}.mxl"
            fetch(url, archive)
            with zipfile.ZipFile(archive) as data:
                xml = data.read(stem + ".xml")
        root = ET.fromstring(xml)
        if root.tag != "score-partwise" or root.findall("identification/rights"):
            raise ValueError(f"Review the score's internal rights before distribution: {name}")
        (OUT / f"{name}.musicxml").write_bytes(xml)
        record = {
            "id": name, "title": title, "scoreSource": local.get("sourceUrl", f"https://scorebase.org/scores/{scorebase_id}") if local else f"https://scorebase.org/scores/{scorebase_id}",
            "originalSource": root.findtext("identification/source"), "dataset": local.get("sourceUrl") if local else DATASET,
            "datasetLicense": "Public Domain" if local else "CC-BY-4.0", "scoreLicense": "CC0-1.0" if row["license"] == "cc-zero" else "PDM-1.0",
            "licenseConflict": False, "metadataPath": row["metadata"], "datasetPath": row["mxl"],
            "sha256": hashlib.sha256(xml).hexdigest(), "verifiedAt": date.today().isoformat(),
            "metadata": row,
        }
        selection = next((item for item in SELECTION if item["id"] == name), {})
        record.update({"composer": row["composer_name"], "parts": [part.findtext("part-name", "") for part in root.findall("part-list/score-part")], "measures": len(root.findall("part")[0].findall("measure")), "category": selection.get("category", "orchestra"), "featured": selection.get("featured", False), "editionStatus": "パート構成を確認。原譜との全音符の校合は未実施。"})
        manifest.append(record)
        print(f"{name}: {len(root.findall('part'))} parts, public-domain metadata checked")
    (OUT / "sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    fields = ["id", "title", "composer", "parts", "measures", "category", "featured", "scoreLicense", "scoreSource", "editionStatus"]
    (OUT / "catalog.json").write_text(json.dumps([{key: record[key] for key in fields} for record in manifest], ensure_ascii=False, indent=2) + "\n")
    (OUT / "README.md").write_text(
        "# Ensemble MusicXML sources\n\n"
        "These scores are marked CC0 or Public Domain according to the per-score source metadata. "
        "PDMX-backed entries were checked for license_conflict=False, no paywall, valid files, and no internal rights statement; "
        "locally typeset entries record their public source in sources.json. The MusicXML is distributed unchanged. "
        "sources.json records exact files, hashes and metadata.\n\n"
        "PDMX dataset: Phillip Long, Zachary Novack, Julian McAuley and Taylor Berg-Kirkpatrick, "
        "*PDMX: A Large-Scale Public Domain MusicXML Dataset for Symbolic Music Processing*, ICASSP 2025. "
        "Dataset compilation: CC BY 4.0. https://zenodo.org/records/15571083 "
        "https://creativecommons.org/licenses/by/4.0/\n\n"
        "See also Weihan Xu et al., *Generating Symbolic Music from Natural Language Prompts using an LLM-Enhanced Dataset*, 2024.\n"
    )

    with zipfile.ZipFile(OUT / "ConvoCerto-MusicXML.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for record in manifest:
            name = record["id"] + ".musicxml"
            bundle.write(OUT / name, name)
        for name in ["README.md", "sources.json", "catalog.json"]:
            bundle.write(OUT / name, name)


if __name__ == "__main__":
    main()
