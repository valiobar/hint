import pytest

from app.ai.hint_chain import generate_hint
from app.models.retrieval import Chunk
from tests.conftest import FakeRetrievalService, make_fake_llm, make_hint_request


@pytest.mark.asyncio
async def test_generate_hint_clamps_and_sources() -> None:
    svc = FakeRetrievalService(
        [Chunk(text="Export from the toolbar.", filename="manual.pdf", score=0.2)]
    )
    result = await generate_hint(
        make_hint_request(), svc, llm=make_fake_llm("x" * 200)
    )
    assert len(result.hint) == 140
    assert result.source == "manual.pdf"
    assert svc.calls == [("cmp_test0001", "Export report — Reports", 3)]


@pytest.mark.asyncio
async def test_generate_hint_empty_kb_has_no_source() -> None:
    result = await generate_hint(
        make_hint_request(),
        FakeRetrievalService([]),
        llm=make_fake_llm("Exports the current report."),
    )
    assert result.source is None
