import pytest

from app.ai.chat_graph import build_chat_graph
from app.ai.prompts import ANSWER_SYSTEM
from app.models.assist import ElementDescriptor
from app.models.retrieval import Chunk
from tests.conftest import (
    FakeRetrievalService,
    make_chat_state,
    make_fake_llm,
    make_page_context,
)


def test_answer_system_requests_numbered_steps() -> None:
    assert "numbered list of steps" in ANSWER_SYSTEM
    assert "at most ONE on-screen element" in ANSWER_SYSTEM


def test_answer_system_requires_current_page_precondition_check() -> None:
    assert "RIGHT NOW" in ANSWER_SYSTEM
    assert "wrong page or not signed in" in ANSWER_SYSTEM
    assert "Never present a control as visible" in ANSWER_SYSTEM
    assert "Page-state assessment" in ANSWER_SYSTEM
    assert "make its\naction the FIRST numbered step" in ANSWER_SYSTEM


@pytest.mark.asyncio
async def test_single_message_skips_condense_and_retrieves_verbatim() -> None:
    svc = FakeRetrievalService(
        [Chunk(text="Export from the toolbar.", filename="manual.pdf", score=0.1)]
    )
    fake_llm = make_fake_llm("Click the Export button in the toolbar.")
    graph = build_chat_graph(
        svc, llm_condense=fake_llm, llm_answer=fake_llm, llm_assess=fake_llm
    )
    state = await graph.ainvoke(make_chat_state(question="how do I export?"))
    assert svc.calls == [("cmp_test0001", "how do I export?", 5)]
    assert state["answer"]


@pytest.mark.asyncio
async def test_assess_page_skips_llm_when_no_elements_captured() -> None:
    svc = FakeRetrievalService()
    fake_llm = make_fake_llm("Some answer.")
    assess_llm = make_fake_llm("This reply must never be used.")
    graph = build_chat_graph(
        svc, llm_condense=fake_llm, llm_answer=fake_llm, llm_assess=assess_llm
    )
    # Default page context has no interactive elements — cannot judge.
    state = await graph.ainvoke(make_chat_state())
    assert state["page_state"] == "READY"


@pytest.mark.asyncio
async def test_assess_page_writes_blocker_verdict_into_state() -> None:
    svc = FakeRetrievalService(
        [Chunk(text="Create it in the sidebar.", filename="manual.md", score=0.1)]
    )
    fake_llm = make_fake_llm("1. Sign in first.")
    assess_llm = make_fake_llm(
        'The user must first sign in using the "Sign in" button.'
    )
    graph = build_chat_graph(
        svc, llm_condense=fake_llm, llm_answer=fake_llm, llm_assess=assess_llm
    )
    state = make_chat_state(question="how do I create a company?")
    state["page_context"] = make_page_context(
        url="http://localhost:3001/",
        title="Hint Admin",
        interactive=[
            ElementDescriptor(
                tag="button",
                text="Sign in",
                role="button",
                attrs={},
                selector_path="form > button",
            )
        ],
    )
    result = await graph.ainvoke(state)
    assert '"Sign in"' in result["page_state"]
    assert result["answer"]
