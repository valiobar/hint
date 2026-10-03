import logging
from typing import Any

from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: Langfuse | None = None


def _get_client() -> Langfuse | None:
    """Process-singleton client, or None when tracing is off or misconfigured."""
    global _client
    settings = get_settings()
    if not (
        settings.langfuse_enabled
        and settings.langfuse_public_key
        and settings.langfuse_secret_key
    ):
        return None
    if _client is None:
        try:
            _client = Langfuse(
                public_key=settings.langfuse_public_key,
                secret_key=settings.langfuse_secret_key,
                host=settings.langfuse_host,
            )
        except Exception:
            logger.warning(
                "Langfuse client init failed; tracing disabled", exc_info=True
            )
            return None
    return _client


def trace_config(*, name: str, company_id: str) -> dict[str, Any] | None:
    """RunnableConfig for graph/LLM invokes; None when tracing is off.

    ``user_id`` is the tenant (``company_id``). Widget callers are anonymous;
    do not invent a personal identifier.
    """
    if _get_client() is None:
        return None
    settings = get_settings()
    return {
        "callbacks": [
            CallbackHandler(
                public_key=settings.langfuse_public_key,
                # v3 only copies run_name onto the trace when this is set.
                update_trace=True,
            )
        ],
        "run_name": name,  # trace name: "chat" | "hint"
        "metadata": {
            "langfuse_user_id": company_id,
            "langfuse_tags": [
                name,
                f"company:{company_id}",
                f"provider:{settings.llm_provider}",
            ],
        },
    }


def shutdown_langfuse() -> None:
    if _client is not None:
        _client.flush()
        _client.shutdown()
