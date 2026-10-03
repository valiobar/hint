from datetime import datetime
from typing import Literal

from pydantic import BaseModel

UsageKind = Literal["chat", "hint"]


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class UsageSummary(BaseModel):
    period_start: datetime
    period_end: datetime
    allowance_usd: float  # included in the flat plan; -1 == unlimited
    used_usd: float  # marked-up billable usage this period
    overage_usd: float  # billed on top of the flat fee (0 if unlimited)
    pricing_tier: Literal["peak", "offpeak"]  # current time-of-use tier
