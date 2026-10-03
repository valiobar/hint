from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.models.user import UserInDB


class PlanLimits(BaseModel):
    max_companies: int
    url_ingestion: bool
    monthly_cost_usd: float  # included usage allowance (USD); -1 == unlimited


PLAN_LIMITS: dict[str, PlanLimits] = {
    "basic": PlanLimits(
        max_companies=1,
        url_ingestion=False,
        monthly_cost_usd=5.0,
    ),
    "pro": PlanLimits(
        max_companies=10,
        url_ingestion=True,
        monthly_cost_usd=50.0,
    ),
}
SUPERADMIN_LIMITS = PlanLimits(
    max_companies=10_000,
    url_ingestion=True,
    monthly_cost_usd=-1,
)
NO_PLAN_LIMITS = PlanLimits(
    max_companies=0,
    url_ingestion=False,
    monthly_cost_usd=0.0,
)


def resolve_limits(user: "UserInDB") -> PlanLimits:
    if user.role == "superadmin":
        return SUPERADMIN_LIMITS
    if user.subscription_status in ("active", "trialing") and user.plan:
        return PLAN_LIMITS[user.plan]
    return NO_PLAN_LIMITS


def billing_period(user: "UserInDB") -> tuple[datetime, datetime]:
    end = user.current_period_end
    start = user.current_period_start
    if start and end:
        return start, end
    if end:
        return end - timedelta(days=30), end
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now


class CheckoutRequest(BaseModel):
    plan: Literal["basic", "pro"]


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str
