from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from convo_certo.main import app

SCORES_DIR = Path(__file__).resolve().parent.parent.parent / "public" / "scores"


@pytest.fixture
def scores_dir():
    return SCORES_DIR


@pytest.fixture
def sample_duet_path(scores_dir):
    path = scores_dir / "sample-duet.musicxml"
    assert path.exists(), f"Fixture not found: {path}"
    return path


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
