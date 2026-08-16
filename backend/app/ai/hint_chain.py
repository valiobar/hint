from langchain_core.language_models.chat_models import BaseChatModel

from app.ai.llm_factory import create_chat_llm
from app.ai.prompts import HINT_PROMPT, format_chunks, format_element
from app.models.assist import HintRequest, HintResponse
from app.services.retrieval_service import RetrievalService

HINT_MAX_CHARS = 140


def build_hint_query(body: HintRequest) -> str:
    label = body.element.text or body.element.attrs.get("aria-label", "")
    return f"{label} — {body.page_context.title}".strip(" —")


async def generate_hint(
    body: HintRequest,
    retrieval_service: RetrievalService,
    llm: BaseChatModel | None = None,
) -> HintResponse:
    hint_llm = llm or create_chat_llm(temperature=0.2, max_tokens=80)
    chunks = await retrieval_service.retrieve(
        body.company_id, build_hint_query(body), k=3
    )
    result = await hint_llm.ainvoke(
        HINT_PROMPT.format(
            page_title=body.page_context.title,
            element=format_element(body.element),
            chunks=format_chunks(chunks),
        )
    )
    return HintResponse(
        hint=result.content.strip()[:HINT_MAX_CHARS],
        source=chunks[0].filename if chunks else None,
    )
