from app.models.assist import HintResponse
from app.services.hint_cache import HintCache
from tests.conftest import make_hint_request


def test_key_ignores_query_string_and_is_stable() -> None:
    a = make_hint_request(url="https://app.acme.com/reports?utm_source=x")
    b = make_hint_request(url="https://app.acme.com/reports")
    assert HintCache.key(a) == HintCache.key(b)


def test_get_returns_none_after_ttl(monkeypatch) -> None:
    cache = HintCache(ttl_seconds=10, max_entries=8)
    now = [1000.0]
    monkeypatch.setattr("app.services.hint_cache.time.monotonic", lambda: now[0])
    cache.set("k", HintResponse(hint="h"))
    assert cache.get("k") is not None
    now[0] += 11
    assert cache.get("k") is None


def test_set_evicts_oldest_entry_at_capacity() -> None:
    cache = HintCache(ttl_seconds=60, max_entries=2)
    cache.set("a", HintResponse(hint="a"))
    cache.set("b", HintResponse(hint="b"))
    cache.set("c", HintResponse(hint="c"))
    assert cache.get("a") is None
    assert cache.get("c") is not None
