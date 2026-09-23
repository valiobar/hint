from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.config import get_settings

_DEEPSEEK_THINKING_DISABLED = {"thinking": {"type": "disabled"}}


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
    if settings.llm_provider == "deepseek":
        return ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            streaming=streaming,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body=_DEEPSEEK_THINKING_DISABLED,
        )
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")
