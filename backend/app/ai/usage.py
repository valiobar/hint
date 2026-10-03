from langchain_core.messages import BaseMessage

from app.config import Settings
from app.models.usage import TokenUsage


def _mapping(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def usage_from_message(msg: BaseMessage) -> TokenUsage:
    meta = _mapping(getattr(msg, "usage_metadata", None))
    return TokenUsage(
        input_tokens=int(meta.get("input_tokens") or 0),
        output_tokens=int(meta.get("output_tokens") or 0),
    )


def model_of(msg: BaseMessage, default: str) -> str:
    meta = _mapping(getattr(msg, "response_metadata", None))
    return str(meta.get("model_name") or meta.get("model") or default)


def default_model(settings: Settings) -> str:
    if settings.llm_provider == "openai":
        return settings.llm_model
    return settings.deepseek_model
