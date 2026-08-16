import hashlib
import time
from collections import OrderedDict
from urllib.parse import urlparse

from app.models.assist import HintRequest, HintResponse


class HintCache:
    def __init__(self, ttl_seconds: int, max_entries: int):
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._store: OrderedDict[str, tuple[float, HintResponse]] = OrderedDict()

    @staticmethod
    def key(body: HintRequest) -> str:
        path = urlparse(body.page_context.url).path
        raw = "|".join(
            [
                body.company_id,
                path,
                body.element.selector_path,
                body.element.text or "",
            ]
        )
        return hashlib.sha1(raw.encode()).hexdigest()

    def get(self, key: str) -> HintResponse | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: HintResponse) -> None:
        if key not in self._store and len(self._store) >= self._max_entries:
            self._store.popitem(last=False)
        self._store[key] = (time.monotonic() + self._ttl, value)
        self._store.move_to_end(key)
