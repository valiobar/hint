import pytest
from langfuse.langchain import CallbackHandler

from app.ai import observability
from app.config import Settings


@pytest.fixture(autouse=True)
def reset_client(monkeypatch):
    monkeypatch.setattr(observability, "_client", None)
    yield
    if observability._client is not None:
        observability._client.shutdown()
        observability._client = None


def use_settings(monkeypatch, **overrides) -> None:
    """Hermetic settings: no .env, no process env (same spirit as test_llm_factory)."""
    for name in (
        "LANGFUSE_ENABLED",
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_HOST",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(
        "app.ai.observability.get_settings",
        lambda: Settings(_env_file=None, **overrides),
    )


def test_disabled_by_default_returns_none(monkeypatch):
    use_settings(monkeypatch)  # defaults → langfuse_enabled=False
    assert observability.trace_config(name="chat", company_id="cmp_x") is None


def test_enabled_without_keys_is_fail_safe(monkeypatch):
    use_settings(monkeypatch, langfuse_enabled=True)
    assert observability.trace_config(name="chat", company_id="cmp_x") is None


def test_enabled_with_keys_builds_config(monkeypatch):
    use_settings(
        monkeypatch,
        langfuse_enabled=True,
        langfuse_public_key="pk-lf-test",
        langfuse_secret_key="sk-lf-test",
    )
    cfg = observability.trace_config(name="hint", company_id="cmp_x")
    assert cfg is not None and cfg["run_name"] == "hint"
    assert cfg["metadata"]["langfuse_user_id"] == "cmp_x"
    assert "company:cmp_x" in cfg["metadata"]["langfuse_tags"]
    assert len(cfg["callbacks"]) == 1
    assert isinstance(cfg["callbacks"][0], CallbackHandler)


def test_shutdown_noop_when_disabled(monkeypatch):
    use_settings(monkeypatch)
    observability.shutdown_langfuse()  # must not raise
