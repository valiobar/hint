from datetime import datetime, timezone

import pytest

from app.models.pricing import cost_usd, is_deepseek_peak, price_tier
from app.services.pricing_service import LivePricing, StaticPricing

PEAK = datetime(2026, 10, 5, 7, 0, tzinfo=timezone.utc)  # Mon 07:00 UTC → peak
OFFPEAK = datetime(2026, 10, 4, 7, 0, tzinfo=timezone.utc)  # Sun 07:00 UTC → off-peak


def test_schedule_picks_peak_and_offpeak() -> None:
    assert is_deepseek_peak(PEAK) is True
    assert is_deepseek_peak(OFFPEAK) is False
    assert price_tier("deepseek-flash", OFFPEAK) == "offpeak"
    assert price_tier("deepseek-flash", PEAK) == "peak"
    assert price_tier("gpt-4o-mini", PEAK) == "flat"


def test_offpeak_is_half_of_peak() -> None:
    peak = cost_usd("deepseek-flash", 1_000_000, 1_000_000, PEAK)  # 0.30 + 1.20
    off = cost_usd("deepseek-flash", 1_000_000, 1_000_000, OFFPEAK)  # half
    assert peak == pytest.approx(1.50)
    assert off == pytest.approx(0.75)


@pytest.mark.asyncio
async def test_static_provider_is_time_of_use_aware() -> None:
    static = StaticPricing()
    assert await static.cost_usd("deepseek-flash", 1_000_000, 0, PEAK) == pytest.approx(0.30)
    assert await static.cost_usd("deepseek-flash", 1_000_000, 0, OFFPEAK) == pytest.approx(0.15)


@pytest.mark.asyncio
async def test_live_pricing_keeps_deepseek_on_local_schedule_without_fetch() -> None:
    # DeepSeek is never in the dataset, so LivePricing must not touch the network
    # for it — a bogus URL proves no fetch happens for time-of-use models.
    live = LivePricing(url="http://127.0.0.1:0/none.json", ttl_seconds=86_400)
    assert await live.cost_usd("deepseek-flash", 1_000_000, 0, OFFPEAK) == pytest.approx(0.15)


@pytest.mark.asyncio
async def test_live_pricing_falls_back_to_static_when_refresh_fails() -> None:
    # Flat model + failed fetch → falls back to the local MODEL_PRICES table.
    live = LivePricing(url="http://127.0.0.1:0/none.json", ttl_seconds=0)
    cost = await live.cost_usd("gpt-4o-mini", 1_000_000, 1_000_000, PEAK)
    assert cost == pytest.approx(0.75)  # 0.15 + 0.60 from the static table
