import logging
import time
from datetime import datetime, timezone
from typing import Protocol

import httpx

from app.models.pricing import (
    MODEL_PRICES,
    TIME_OF_USE_PRICES,
    ModelPrice,
    cost_usd,
)

logger = logging.getLogger(__name__)


class PricingProvider(Protocol):
    async def cost_usd(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        when: datetime | None = None,
    ) -> float: ...


class StaticPricing:
    """Prices from the local module table; always time-of-use aware."""

    async def cost_usd(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        when: datetime | None = None,
    ) -> float:
        return cost_usd(model, input_tokens, output_tokens, when)


class LivePricing:
    """Daily LiteLLM fetch for flat models; time-of-use + unknown models fall
    back to the local module table. A fetch/parse error never breaks a request:
    it logs and reuses the last-known cache, then the static table."""

    def __init__(self, url: str, ttl_seconds: int) -> None:
        self._url = url
        self._ttl = ttl_seconds
        self._prices: dict[str, ModelPrice] = {}
        self._fetched_at = 0.0

    async def refresh(self) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            data = (await client.get(self._url)).json()
        live = {
            name: ModelPrice(
                input_per_1m=float(v["input_cost_per_token"]) * 1_000_000,
                output_per_1m=float(v["output_cost_per_token"]) * 1_000_000,
            )
            for name, v in data.items()
            if isinstance(v, dict) and "input_cost_per_token" in v
        }
        self._prices = {**live, **MODEL_PRICES}  # local flat overrides win
        self._fetched_at = time.monotonic()

    async def cost_usd(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        when: datetime | None = None,
    ) -> float:
        when = when or datetime.now(timezone.utc)
        # DeepSeek peak/off-peak is never in the dataset → always local schedule.
        if model in TIME_OF_USE_PRICES:
            return cost_usd(model, input_tokens, output_tokens, when)
        if time.monotonic() - self._fetched_at > self._ttl:
            try:
                await self.refresh()
            except Exception:  # noqa: BLE001 — never break a request on pricing
                logger.warning(
                    "live price refresh failed; using fallback", exc_info=True
                )
        price = self._prices.get(model)
        if price is None:
            return cost_usd(model, input_tokens, output_tokens, when)
        return (
            input_tokens * price.input_per_1m
            + output_tokens * price.output_per_1m
        ) / 1_000_000
