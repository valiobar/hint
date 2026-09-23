import pytest

from app.ai.llm_factory import create_chat_llm
from app.config import Settings


def test_deepseek_builds_flash_client(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.ai.llm_factory.get_settings",
        lambda: Settings(llm_provider="deepseek", deepseek_api_key="sk-ds"),
    )
    llm = create_chat_llm(max_tokens=80)
    assert llm.model_name == "deepseek-flash"
    base = str(getattr(llm, "openai_api_base", None) or getattr(llm, "base_url", ""))
    assert "api.deepseek.com" in base
    extra_body = getattr(llm, "extra_body", None)
    assert extra_body == {"thinking": {"type": "disabled"}}


def test_openai_provider_uses_llm_model(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.ai.llm_factory.get_settings",
        lambda: Settings(
            llm_provider="openai",
            llm_model="gpt-4o-mini",
            openai_api_key="sk-oai",
        ),
    )
    llm = create_chat_llm()
    assert llm.model_name == "gpt-4o-mini"
    base = getattr(llm, "openai_api_base", None) or getattr(llm, "base_url", None)
    assert base in (None, "")


def test_unknown_provider_raises(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.ai.llm_factory.get_settings",
        lambda: Settings(llm_provider="anthropic"),
    )
    with pytest.raises(ValueError, match="Unsupported LLM provider"):
        create_chat_llm()
