from typing import TypedDict

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from app.ai.llm_factory import create_chat_llm
from app.ai.prompts import (
    ANSWER_SYSTEM,
    CONDENSE_PROMPT,
    format_chunks,
    format_history,
    format_interactive,
)
from app.models.assist import ChatMessage, PageContext
from app.models.retrieval import Chunk
from app.services.retrieval_service import RetrievalService

RETRIEVE_NODE = "retrieve"
ANSWER_NODE = "generate_answer"


class ChatState(TypedDict):
    company_id: str
    company_name: str
    messages: list[ChatMessage]
    page_context: PageContext
    query: str
    chunks: list[Chunk]
    answer: str


def build_chat_graph(
    retrieval_service: RetrievalService,
    llm_condense: BaseChatModel | None = None,
    llm_answer: BaseChatModel | None = None,
):
    condense_llm = llm_condense or create_chat_llm(temperature=0.0, max_tokens=100)
    answer_llm = llm_answer or create_chat_llm(streaming=True, max_tokens=400)

    async def condense_query(state: ChatState) -> dict:
        question = state["messages"][-1].content
        if len(state["messages"]) == 1:
            return {"query": question}
        prompt = CONDENSE_PROMPT.format(
            history=format_history(state["messages"]), question=question
        )
        rewritten = await condense_llm.ainvoke(prompt)
        return {"query": rewritten.content.strip() or question}

    async def retrieve(state: ChatState) -> dict:
        chunks = await retrieval_service.retrieve(
            state["company_id"], state["query"], k=5
        )
        return {"chunks": chunks}

    async def answer(state: ChatState) -> dict:
        page = state["page_context"]
        system = ANSWER_SYSTEM.format(
            company_name=state["company_name"],
            url=page.url,
            title=page.title,
            interactive_summary=format_interactive(page.interactive),
            chunks=format_chunks(state["chunks"]),
        )
        history = [
            HumanMessage(m.content) if m.role == "user" else AIMessage(m.content)
            for m in state["messages"]
        ]
        response = await answer_llm.ainvoke([SystemMessage(system), *history])
        return {"answer": response.content}

    graph = StateGraph(ChatState)
    graph.add_node("condense_query", condense_query)
    graph.add_node(RETRIEVE_NODE, retrieve)
    graph.add_node(ANSWER_NODE, answer)
    graph.add_edge(START, "condense_query")
    graph.add_edge("condense_query", RETRIEVE_NODE)
    graph.add_edge(RETRIEVE_NODE, ANSWER_NODE)
    graph.add_edge(ANSWER_NODE, END)
    return graph.compile()
