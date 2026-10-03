from fastapi import APIRouter, Depends, HTTPException

from app.models.billing import CheckoutRequest, CheckoutResponse, PortalResponse
from app.models.usage import UsageSummary
from app.models.user import UserInDB
from app.routes.deps import get_billing_service, get_usage_service, require_user
from app.services.billing_service import BillingService
from app.services.usage_service import UsageService

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    user: UserInDB = Depends(require_user),
    svc: BillingService = Depends(get_billing_service),
) -> CheckoutResponse:
    return CheckoutResponse(checkout_url=await svc.create_checkout(user, body.plan))


@router.get("/portal", response_model=PortalResponse)
async def portal(
    user: UserInDB = Depends(require_user),
    svc: BillingService = Depends(get_billing_service),
) -> PortalResponse:
    if not user.polar_customer_id:
        raise HTTPException(status_code=404, detail="No subscription on file")
    return PortalResponse(portal_url=await svc.create_portal(user))


@router.get("/usage", response_model=UsageSummary)
async def usage(
    user: UserInDB = Depends(require_user),
    svc: UsageService = Depends(get_usage_service),
) -> UsageSummary:
    return await svc.summary_for_user(user)
