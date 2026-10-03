from datetime import datetime, timezone

from pydantic import BaseModel


class ModelPrice(BaseModel):
    input_per_1m: float  # USD per 1M input (prompt) tokens
    output_per_1m: float  # USD per 1M output (completion) tokens


class TimeOfUsePrice(BaseModel):
    """DeepSeek-style price: off-peak is a flat multiple of the peak rate."""

    peak: ModelPrice
    offpeak_multiplier: float = 0.5  # DeepSeek: off-peak == half of peak

    def at(self, when: datetime) -> ModelPrice:
        if is_deepseek_peak(when):
            return self.peak
        m = self.offpeak_multiplier
        return ModelPrice(
            input_per_1m=self.peak.input_per_1m * m,
            output_per_1m=self.peak.output_per_1m * m,
        )


# Flat (single-rate) models — refreshable from LiteLLM (Step 11.12 LivePricing).
# These are Hint-owned billing numbers, independent of the Langfuse custom
# price entry. DeepSeek cache-hit discounts are intentionally not modeled.
MODEL_PRICES: dict[str, ModelPrice] = {
    "gpt-4o-mini": ModelPrice(input_per_1m=0.15, output_per_1m=0.60),
}

# Time-of-use models — PEAK (cache-miss) list prices; off-peak handled above.
# Not in any public dataset, so always a local override.
TIME_OF_USE_PRICES: dict[str, TimeOfUsePrice] = {
    "deepseek-flash": TimeOfUsePrice(
        peak=ModelPrice(input_per_1m=0.30, output_per_1m=1.20),
    ),
}

_ZERO_PRICE = ModelPrice(input_per_1m=0.0, output_per_1m=0.0)
# Peak: Mon–Fri 01:00–04:00 and 06:00–10:00 UTC. Everything else is off-peak.
_PEAK_WINDOWS_UTC = ((1, 4), (6, 10))


def is_deepseek_peak(when: datetime) -> bool:
    """True inside DeepSeek's UTC peak windows (weekday 01–04 / 06–10)."""
    when = when.astimezone(timezone.utc)
    if when.weekday() >= 5:  # Sat/Sun → always off-peak
        return False
    return any(lo <= when.hour < hi for lo, hi in _PEAK_WINDOWS_UTC)


def price_for(model: str, when: datetime) -> ModelPrice:
    tou = TIME_OF_USE_PRICES.get(model)
    if tou is not None:
        return tou.at(when)
    return MODEL_PRICES.get(model, _ZERO_PRICE)


def price_tier(model: str, when: datetime) -> str:
    """Audit tier for the charge: 'peak' | 'offpeak' | 'flat'."""
    if model not in TIME_OF_USE_PRICES:
        return "flat"
    return "peak" if is_deepseek_peak(when) else "offpeak"


def cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    when: datetime | None = None,
) -> float:
    """Convert token counts to USD for the given model (unknown model → $0).

    Time-of-use models (DeepSeek) are priced from ``when``; flat models ignore
    it. ``when`` defaults to the current UTC time.
    """
    when = when or datetime.now(timezone.utc)
    price = price_for(model, when)
    return (
        input_tokens * price.input_per_1m + output_tokens * price.output_per_1m
    ) / 1_000_000
