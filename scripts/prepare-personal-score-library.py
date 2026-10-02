from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
COMMIT = "8f677853c45b74ca0afcd79677e5379c06c82354"
CACHE = ROOT / ".repertoire-cache/requested-2026-09-25"
REPOSITORY = "https://github.com/MarkGotham/Hauptstimme"
WORKS = [
    ("Beethoven,_Ludwig_van", 3, 55, "ベートーベン 交響曲第3番 英雄"),
    ("Beethoven,_Ludwig_van", 4, 60, "ベートーベン 交響曲第4番"),
    ("Beethoven,_Ludwig_van", 5, 67, "ベートーベン 交響曲第5番 運命"),
    ("Beethoven,_Ludwig_van", 6, 68, "ベートーベン 交響曲第6番 田園"),
    ("Beethoven,_Ludwig_van", 7, 92, "ベートーベン 交響曲第7番"),
    ("Beethoven,_Ludwig_van", 8, 93, "ベートーベン 交響曲第8番"),
    ("Brahms,_Johannes", 1, 68, "ブラームス 交響曲第1番"),
    ("Brahms,_Johannes", 3, 90, "ブラームス 交響曲第3番"),
    ("Brahms,_Johannes", 4, 98, "ブラームス 交響曲第4番"),
]


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def download(entry):
    path = entry["path"]
    target = CACHE / "hauptstimme-personal" / Path(path).name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        partial = target.with_suffix(".download")
        subprocess.run([
            "curl", "--fail", "--location", "--silent", "--show-error",
            "--connect-timeout", "15", "--max-time", "90", "--retry", "1",
            f"https://raw.githubusercontent.com/MarkGotham/Hauptstimme/{COMMIT}/{quote(path, safe='/,_().')}",
            "--output", str(partial),
        ], check=True)
        partial.replace(target)
    content = target.read_bytes()
    blob = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()
    if blob != entry["sha"]:
        raise ValueError(f"Source hash mismatch: {path}")
    return target


def prepare_score(entry, source, destination, title):
    with zipfile.ZipFile(source) as archive:
        if archive.testzip() is not None:
            raise ValueError(f"Invalid ZIP: {source}")
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = next(e.attrib["full-path"] for e in container.iter() if e.tag.split("}")[-1] == "rootfile")
        original = archive.read(rootfile).decode("utf-8")
        updated, count = re.subn(r"<work-title>.*?</work-title>", f"<work-title>{title}</work-title>", original, count=1, flags=re.S)
        if count != 1:
            raise ValueError(f"Missing unique title: {source}")
        before, after = ET.fromstring(original), ET.fromstring(updated)
        before.find("work/work-title").text = title
        if ET.tostring(before) != ET.tostring(after):
            raise ValueError(f"Unexpected musical change: {source}")
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as target:
            for item in archive.infolist():
                target.writestr(item, updated.encode("utf-8") if item.filename == rootfile else archive.read(item.filename))
    parts = after.findall("part")
    return {
        "file": destination.name,
        "title": title,
        "source": f"{REPOSITORY}/blob/{COMMIT}/{quote(entry['path'], safe='/,_().')}",
        "download": f"https://raw.githubusercontent.com/MarkGotham/Hauptstimme/{COMMIT}/{quote(entry['path'], safe='/,_().')}",
        "source_git_blob": entry["sha"],
        "source_sha256": sha256(source.read_bytes()),
        "sha256": sha256(destination.read_bytes()),
        "scoreLicense": "CC0-1.0",
        "annotationLicense": "CC-BY-SA (version not specified by source)",
        "licenseSource": f"{REPOSITORY}/blob/{COMMIT}/README.md#licence",
        "attribution": "Hauptstimme / OpenScore Orchestra, Mark Gotham and contributors; original credits retained in MusicXML",
        "changes": "work-title only; all musical content and existing annotations unchanged",
        "parts": [p.findtext("part-name") for p in after.findall("part-list/score-part")],
        "measuresByPart": [len(p.findall("measure")) for p in parts],
        "clarinetTransposition": [
            {"part": p.findtext("part-name"), "transpose": [ET.tostring(t, encoding="unicode") for t in after.findall(f"part[@id='{p.attrib['id']}']/measure/attributes/transpose")]}
            for p in after.findall("part-list/score-part") if "clarinet" in p.findtext("part-name", "").lower()
        ],
        "validation": "ZIP integrity, XML structure and title-only diff; see playback-audit.json for app checks; no complete note-by-note collation",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    library = args.destination.expanduser().resolve()
    output = library / "01 交響曲・総譜"
    output.mkdir(parents=True, exist_ok=True)
    tree = json.loads((ROOT / ".repertoire-cache/hauptstimme-tree.json").read_text())
    if tree["sha"] != COMMIT:
        raise ValueError("Unexpected source revision")
    tree_by_path = {entry["path"]: entry for entry in tree["tree"]}
    selections = []
    for composer, number, opus, name in WORKS:
        for movement in range(1, 6 if composer.startswith("Beethoven") and number == 6 else 5):
            path = f"data/{composer}/Symphony_No.{number},_Op.{opus}/{movement}/{composer.split(',')[0]}_Op.{opus}_{movement}.mxl"
            selections.append((tree_by_path[path], name, movement))
    with ThreadPoolExecutor(max_workers=4) as executor:
        files = list(executor.map(download, [s[0] for s in selections]))
    manifest = []
    for (entry, name, movement), source in zip(selections, files):
        work_dir = output / name
        work_dir.mkdir(exist_ok=True)
        title = f"{name} 第{movement}楽章"
        destination = work_dir / f"{title}.mxl"
        record = prepare_score(entry, source, destination, title)
        record["file"] = str(destination.relative_to(library))
        manifest.append(record)
    save_json(output / "sources.json", manifest)
    shutil.copyfile(CACHE / "Hauptstimme-README.md", output / "SOURCE-README.md")
    (output / "利用条件.txt").write_text(
        "出典: Hauptstimme / OpenScore Orchestra, Mark Gotham and contributors\n"
        f"{REPOSITORY}/tree/{COMMIT}\n\n"
        "公開元の表示: 楽譜 CC0 1.0 Universal / 分析注釈 CC-BY-SA（版番号の指定なし）\n"
        "元の著者・版・注釈をMusicXML内に保存。変更は曲名への作曲者・楽章番号追加のみ。\n"
        "公開再配布時は注釈の出典表示・変更明記・継承条件も維持してください。\n"
        "正確な公開元の表記は同梱SOURCE-README.mdと各ファイル内のクレジットを参照。\n\n"
        "ConvoCertoでは装飾音、トリル・トレモロ記号の音列化、フェルマータによる自動延長に制限があります。\n"
        "原譜との全音符の校合・全曲の聴取検査は未実施です。\n", encoding="utf-8"
    )
    old = library / "02 以前の52譜・編曲や抜粋を含む"
    old.mkdir(exist_ok=True)
    source_dir = ROOT / "public/repertoire/ensemble"
    catalog = json.loads((source_dir / "catalog.json").read_text())
    old_manifest = []
    container = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
    for item in catalog:
        source = source_dir / f"{item['id']}.musicxml"
        name = re.sub(r'[/\\:*?"<>|]', "_", item["title"])
        target = old / f"{name} [{item['id']}].mxl"
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("META-INF/container.xml", container)
            archive.writestr("score.musicxml", source.read_bytes())
        old_manifest.append({**item, "file": target.name, "xml_sha256": sha256(source.read_bytes()), "mxl_sha256": sha256(target.read_bytes()), "changes": "Lossless ZIP compression; XML bytes unchanged"})
    save_json(old / "catalog.json", old_manifest)
    shutil.copyfile(source_dir / "sources.json", old / "sources.json")
    shutil.copyfile(source_dir / "README.md", old / "SOURCE-README.md")
    (old / "はじめに.txt").write_text("以前に用意した52譜です。全曲の総譜だけでなく、抜粋・編曲・独奏曲も含まれます。\n新版の田園と交響曲は『01 交響曲・総譜』を使ってください。\nXMLの内容はそのまま、容量を減らすため.mxlへ圧縮しています。\n各版の出典・許諾・編成・小節数はcatalog.jsonとsources.jsonにあります。\n", encoding="utf-8")
    references = []
    for path, entry in tree_by_path.items():
        if re.match(r"data/(Beethoven,_Ludwig_van|Brahms,_Johannes)/Symphony_No\..+/\d+/[^/]+\.mxl$", path) and "_melody" not in path:
            composer, work, movement, filename = path.split("/")[1:]
            references.append({"composer": composer, "work": work, "movement": int(movement), "filename": filename, "source": f"{REPOSITORY}/blob/{COMMIT}/{quote(path, safe='/,_().')}", "download": f"https://raw.githubusercontent.com/MarkGotham/Hauptstimme/{COMMIT}/{quote(path, safe='/,_().')}", "bytes": entry["size"], "git_blob": entry["sha"]})
    save_json(library / "交響曲53楽章の入手先.json", references)
    print(json.dumps({"destination": str(library), "symphonic_movements": len(manifest), "legacy_scores": len(old_manifest), "reference_links": len(references), "score_bytes": sum(p.stat().st_size for p in library.rglob("*.mxl"))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
