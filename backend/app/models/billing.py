from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.models.user import UserInDB


class PlanLimits(BaseModel):
    max_companies: int
    url_ingestion: bool


PLAN_LIMITS: dict[str, PlanLimits] = {
    "basic": PlanLimits(max_companies=1, url_ingestion=False),
    "pro": PlanLimits(max_companies=10, url_ingestion=True),
}
SUPERADMIN_LIMITS = PlanLimits(max_companies=10_000, url_ingestion=True)
NO_PLAN_LIMITS = PlanLimits(max_companies=0, url_ingestion=False)


def resolve_limits(user: "UserInDB") -> PlanLimits:
    if user.role == "superadmin":
        return SUPERADMIN_LIMITS
    if user.subscription_status in ("active", "trialing") and user.plan:
        return PLAN_LIMITS[user.plan]
    return NO_PLAN_LIMITS


class CheckoutRequest(BaseModel):
    plan: Literal["basic", "pro"]


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str
