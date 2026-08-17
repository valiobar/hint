import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.ai.chat_graph import ANSWER_NODE, RETRIEVE_NODE, build_chat_graph
from app.ai.hint_chain import generate_hint
from app.models.assist import ChatRequest, HintRequest, HintResponse
from app.repositories.company_repo import CompanyRepository
from app.routes.deps import (
    get_company_repo,
    get_hint_cache,
    get_retrieval_service,
    require_openai_key,
)
from app.services.hint_cache import HintCache
from app.services.retrieval_service import RetrievalService

router = APIRouter(tags=["assist"], dependencies=[Depends(require_openai_key)])


@router.post("/chat")
async def chat(
    body: ChatRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    company_repo: CompanyRepository = Depends(get_company_repo),
) -> EventSourceResponse:
    company = await company_repo.find_by_company_id(body.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")

    graph = build_chat_graph(retrieval)
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
        try:
            async for event in graph.astream_events(initial_state, version="v2"):
                kind = event["event"]
                if (
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
        yield {"event": "done", "data": json.dumps({"sources": sources})}

    return EventSourceResponse(event_stream())


@router.post("/hint", response_model=HintResponse)
async def hint(
    body: HintRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    company_repo: CompanyRepository = Depends(get_company_repo),
    cache: HintCache = Depends(get_hint_cache),
) -> HintResponse:
    if await company_repo.find_by_company_id(body.company_id) is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    key = cache.key(body)
    if (cached := cache.get(key)) is not None:
        return cached
    response = await generate_hint(body, retrieval)
    cache.set(key, response)
    return response
