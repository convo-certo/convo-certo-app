import pytest


@pytest.mark.asyncio
async def test_parse_score(client, sample_duet_path):
    with open(sample_duet_path, "rb") as f:
        response = await client.post(
            "/score/parse",
            files={"file": ("sample-duet.musicxml", f, "application/xml")},
        )

    assert response.status_code == 200
    data = response.json()

    assert data["title"] == "ConvoCerto Sample Duet"
    assert data["tempo"] == 100.0
    assert data["time_signature"]["numerator"] == 4
    assert data["time_signature"]["denominator"] == 4
    assert len(data["parts"]) == 2
    assert data["parts"][0]["name"] == "Clarinet"
    assert data["parts"][1]["name"] == "Piano"
    assert len(data["notes"]) > 0
    assert data["total_measures"] > 0
    assert data["total_beats"] > 0

    for note in data["notes"]:
        assert 0 <= note["pitch"] <= 127
        assert note["onset_beat"] >= 0
        assert note["duration_beat"] > 0
        assert note["part_index"] in (0, 1)


@pytest.mark.asyncio
async def test_parse_score_returns_notes_from_both_parts(client, sample_duet_path):
    with open(sample_duet_path, "rb") as f:
        response = await client.post(
            "/score/parse",
            files={"file": ("sample-duet.musicxml", f, "application/xml")},
        )

    data = response.json()
    part0_notes = [n for n in data["notes"] if n["part_index"] == 0]
    part1_notes = [n for n in data["notes"] if n["part_index"] == 1]
    assert len(part0_notes) > 0
    assert len(part1_notes) > 0


@pytest.mark.asyncio
async def test_parse_score_notes_sorted_by_onset(client, sample_duet_path):
    with open(sample_duet_path, "rb") as f:
        response = await client.post(
            "/score/parse",
            files={"file": ("sample-duet.musicxml", f, "application/xml")},
        )

    notes = response.json()["notes"]
    onsets = [n["onset_beat"] for n in notes]
    assert onsets == sorted(onsets)


@pytest.mark.asyncio
async def test_parse_score_rejects_non_musicxml(client):
    response = await client.post(
        "/score/parse",
        files={"file": ("test.txt", b"not xml", "text/plain")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_parse_score_rejects_invalid_xml(client):
    response = await client.post(
        "/score/parse",
        files={"file": ("test.musicxml", b"<invalid>", "application/xml")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_note_array(client, sample_duet_path):
    with open(sample_duet_path, "rb") as f:
        response = await client.post(
            "/score/note-array",
            files={"file": ("sample-duet.musicxml", f, "application/xml")},
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data["notes"]) > 0
    assert "pitch" in data["fields"]
    assert "onset_beat" in data["fields"]
    assert "duration_beat" in data["fields"]


@pytest.mark.asyncio
async def test_tempo_events(client, sample_duet_path):
    with open(sample_duet_path, "rb") as f:
        response = await client.post(
            "/score/parse",
            files={"file": ("sample-duet.musicxml", f, "application/xml")},
        )

    data = response.json()
    assert len(data["tempo_events"]) >= 1
    assert data["tempo_events"][0]["bpm"] == 100.0
    assert data["tempo_events"][0]["type"] == "instant"
