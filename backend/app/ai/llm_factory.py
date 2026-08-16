from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.config import get_settings


def create_chat_llm(
    *,
    streaming: bool = False,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> BaseChatModel:
    settings = get_settings()
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.llm_model,
            api_key=settings.openai_api_key,
            streaming=streaming,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")
