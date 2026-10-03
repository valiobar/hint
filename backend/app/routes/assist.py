import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.ai.chat_graph import ANSWER_NODE, RETRIEVE_NODE, build_chat_graph
from app.ai.hint_chain import generate_hint
from app.ai.observability import trace_config
from app.ai.usage import default_model, model_of, usage_from_message
from app.config import Settings, get_settings
from app.models.assist import ChatRequest, HintRequest, HintResponse
from app.models.company import Company
from app.models.usage import TokenUsage, UsageKind
from app.repositories.company_repo import CompanyRepository
from app.routes.deps import (
    get_company_repo,
    get_hint_cache,
    get_retrieval_service,
    get_usage_service,
    require_chat_credentials,
)
from app.services.hint_cache import HintCache
from app.services.retrieval_service import RetrievalService
from app.services.usage_service import UsageService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assist"], dependencies=[Depends(require_chat_credentials)])


async def _safe_record(
    usage: UsageService,
    company: Company,
    kind: UsageKind,
    model: str,
    tokens: TokenUsage,
) -> None:
    try:
        await usage.record(company, kind, model, tokens)
    except Exception:  # noqa: BLE001 — usage must never break the response
        logger.warning("usage record failed", exc_info=True)


@router.post("/chat")
async def chat(
    body: ChatRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    company_repo: CompanyRepository = Depends(get_company_repo),
    usage: UsageService = Depends(get_usage_service),
    settings: Settings = Depends(get_settings),
) -> EventSourceResponse:
    company = await company_repo.find_by_company_id(body.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")

    graph = build_chat_graph(retrieval)
    config = trace_config(name="chat", company_id=body.company_id)
    initial_state = {
        "company_id": body.company_id,
        "company_name": company.name,
        "messages": body.messages,
        "page_context": body.page_context,
        "query": "",
        "chunks": [],
        "answer": "",
    }

    async def event_stream():
        sources: list[str] = []
        agg = TokenUsage()
        model = default_model(settings)
        try:
            async for event in graph.astream_events(
                initial_state,
                version="v2",
                **({"config": config} if config else {}),
            ):
                kind = event["event"]
                if kind == "on_chat_model_end":
                    msg = event["data"]["output"]
                    token_usage = usage_from_message(msg)
                    agg.input_tokens += token_usage.input_tokens
                    agg.output_tokens += token_usage.output_tokens
                    model = model_of(msg, model)
                elif (
                    kind == "on_chat_model_stream"
                    and event.get("metadata", {}).get("langgraph_node")
                    == ANSWER_NODE
                ):
                    token = event["data"]["chunk"].content
                    if token:
                        yield {"event": "token", "data": token}
                elif kind == "on_chain_end" and event.get("name") == RETRIEVE_NODE:
                    chunks = event["data"]["output"]["chunks"]
                    sources = list(
                        dict.fromkeys(c.source_url or c.filename for c in chunks)
                    )
        except Exception:  # noqa: BLE001 — stream already committed 200
            yield {
                "event": "error",
                "data": json.dumps({"detail": "Chat generation failed"}),
            }
            return
        await _safe_record(usage, company, "chat", model, agg)
        yield {"event": "done", "data": json.dumps({"sources": sources})}

    return EventSourceResponse(event_stream())


@router.post("/hint", response_model=HintResponse)
async def hint(
    body: HintRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    company_repo: CompanyRepository = Depends(get_company_repo),
    cache: HintCache = Depends(get_hint_cache),
    usage: UsageService = Depends(get_usage_service),
) -> HintResponse:
    company = await company_repo.find_by_company_id(body.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    key = cache.key(body)
    if (cached := cache.get(key)) is not None:
        return cached  # no LLM spend — do not write a $0 usage event
    response, token_usage, model = await generate_hint(body, retrieval)
    cache.set(key, response)
    await _safe_record(usage, company, "hint", model, token_usage)
    return response
