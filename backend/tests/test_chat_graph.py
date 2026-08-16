import pytest

from app.ai.chat_graph import build_chat_graph
from app.models.retrieval import Chunk
from tests.conftest import FakeRetrievalService, make_chat_state, make_fake_llm


@pytest.mark.asyncio
async def test_single_message_skips_condense_and_retrieves_verbatim() -> None:
    svc = FakeRetrievalService(
        [Chunk(text="Export from the toolbar.", filename="manual.pdf", score=0.1)]
    )
    fake_llm = make_fake_llm("Click the Export button in the toolbar.")
    graph = build_chat_graph(svc, llm_condense=fake_llm, llm_answer=fake_llm)
    state = await graph.ainvoke(make_chat_state(question="how do I export?"))
    assert svc.calls == [("cmp_test0001", "how do I export?", 5)]
    assert state["answer"]
