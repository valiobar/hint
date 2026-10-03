"""Manual golden-dataset eval runner for the Hint chat graph.

NOT run in CI — it hits real DeepSeek + OpenAI (burns tokens) and ingests
real Langfuse units (Hobby plan ~50k/month). Run it by hand against the
*local* stack (Mongo + Chroma up, the demo company seeded with its KB docs).

What it does:
  1. Upserts ``evals/golden_dataset.json`` into a Langfuse dataset
     (idempotent on a per-item id, so re-running does not duplicate items).
  2. For every dataset item, runs ``build_chat_graph`` once against the local
     retrieval stack, with a Langfuse ``CallbackHandler`` so the condense /
     retrieve / assess / answer spans land under the dataset-run trace.
  3. Scores keyword presence (``keyword_match`` 0/1 per the plan, plus a
     ``keyword_coverage`` fraction for debugging) and links run + scores to
     the dataset item, so regressions are visible in the Langfuse UI.

Prereqgs (env, same ``.env`` the backend uses):
  LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST  (dataset + scores)
  OPENAI_API_KEY                                             (query embeddings)
  DEEPSEEK_API_KEY (when LLM_PROVIDER=deepseek, the default) (chat LLM)
  MONGODB_URL / CHROMA_HOST / CHROMA_PORT                    (local stack)

Usage (from ``backend/``):
  python -m evals.run_golden_evals
  python -m evals.run_golden_evals --company-id cmp_demo0001 --run-name nightly
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

from app.ai.chat_graph import build_chat_graph
from app.config import get_settings
from app.db import chroma, mongo
from app.models.assist import ChatMessage, PageContext
from app.repositories.company_repo import CompanyRepository
from app.repositories.vector_repo import VectorRepository
from app.services.retrieval_service import RetrievalService

DATASET_NAME = "hint-golden-v1"
DEFAULT_COMPANY_ID = "cmp_demo0001"  # seeded Acme Invoicing demo company
DATASET_PATH = Path(__file__).with_name("golden_dataset.json")


def _item_id(question: str) -> str:
    """Deterministic id so repeated runs upsert instead of duplicating."""
    return "golden-" + hashlib.sha1(question.encode("utf-8")).hexdigest()[:12]


def _load_golden_items() -> list[dict[str, Any]]:
    with DATASET_PATH.open(encoding="utf-8") as fh:
        items = json.load(fh)
    if not isinstance(items, list) or not items:
        raise ValueError(f"{DATASET_PATH.name} must be a non-empty JSON array")
    return items


def _make_state(company_id: str, company_name: str, item_input: dict[str, Any]) -> dict:
    """Mirror the initial ChatState the /chat route builds (one user turn)."""
    page_ctx = item_input.get("page_context") or {
        "url": "http://localhost:3002/",
        "title": "Acme Invoicing",
    }
    return {
        "company_id": company_id,
        "company_name": company_name,
        "messages": [ChatMessage(role="user", content=item_input["question"])],
        "page_context": PageContext(**page_ctx),
        "query": "",
        "chunks": [],
        "answer": "",
    }


def _score_keywords(answer: str, keywords: list[str]) -> tuple[bool, float, list[str]]:
    answer_lc = answer.lower()
    matched = [kw for kw in keywords if kw.lower() in answer_lc]
    hit = len(matched) == len(keywords)
    coverage = len(matched) / len(keywords) if keywords else 1.0
    return hit, coverage, matched


def _upsert_dataset(lf: Langfuse, items: list[dict[str, Any]]) -> None:
    lf.create_dataset(
        name=DATASET_NAME,
        description="Hint chat golden questions for the Acme Invoicing demo company.",
        metadata={"source": "backend/evals/golden_dataset.json"},
    )
    for item in items:
        lf.create_dataset_item(
            dataset_name=DATASET_NAME,
            id=_item_id(item["question"]),  # upsert key — no duplicates on re-run
            input={
                "question": item["question"],
                "page_context": item.get("page_context"),
            },
            expected_output={"keywords": item["expected_keywords"]},
        )


async def _run(company_id: str, run_name: str) -> int:
    settings = get_settings()
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        print(
            "LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are required to push the "
            "dataset and scores. Set them in .env and retry.",
            file=sys.stderr,
        )
        return 2

    items = _load_golden_items()

    lf = Langfuse(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_host,
    )

    mongo.connect()
    chroma.connect()
    try:
        company = await CompanyRepository(mongo.get_db()).find_by_company_id(company_id)
        if company is None:
            print(
                f"Company {company_id!r} not found. Seed the demo company (and "
                "upload its KB docs) before running golden evals.",
                file=sys.stderr,
            )
            return 2

        retrieval = RetrievalService(VectorRepository(chroma.get_chroma()))

        _upsert_dataset(lf, items)
        dataset = lf.get_dataset(DATASET_NAME)

        results: list[tuple[str, bool, float]] = []
        for dataset_item in dataset.items:
            item_input = dataset_item.input
            keywords = dataset_item.expected_output["keywords"]
            question = item_input["question"]

            with dataset_item.run(
                run_name=run_name,
                run_metadata={"company_id": company_id, "provider": settings.llm_provider},
            ) as root_span:
                graph = build_chat_graph(retrieval)
                state = _make_state(company_id, company.name, item_input)
                # A fresh handler nests the graph spans under this run's trace.
                final = await graph.ainvoke(
                    state, config={"callbacks": [CallbackHandler()]}
                )
                answer = final.get("answer", "") or ""

                hit, coverage, matched = _score_keywords(answer, keywords)
                root_span.update_trace(input=item_input, output=answer)
                root_span.score_trace(
                    name="keyword_match",
                    value=1.0 if hit else 0.0,
                    comment=f"matched {matched} of {keywords}",
                )
                root_span.score_trace(name="keyword_coverage", value=coverage)

            results.append((question, hit, coverage))
            print(f"[{'PASS' if hit else 'FAIL'}] {coverage:4.0%}  {question}")

        passed = sum(1 for _, hit, _ in results if hit)
        avg_cov = sum(c for _, _, c in results) / len(results)
        print(
            f"\n{passed}/{len(results)} exact keyword matches · "
            f"avg coverage {avg_cov:.0%} · dataset '{DATASET_NAME}' run '{run_name}'"
        )
        return 0
    finally:
        lf.flush()
        lf.shutdown()
        mongo.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company-id", default=DEFAULT_COMPANY_ID)
    parser.add_argument(
        "--run-name",
        default=f"golden-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.company_id, args.run_name)))


if __name__ == "__main__":
    main()
