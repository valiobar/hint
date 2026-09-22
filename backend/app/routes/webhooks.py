from fastapi import APIRouter, Depends, HTTPException, Request
from polar_sdk.webhooks import WebhookVerificationError

from app.routes.deps import get_billing_service
from app.services.billing_service import BillingService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/polar", status_code=202)
async def polar_webhook(
    request: Request,
    svc: BillingService = Depends(get_billing_service),
) -> None:
    try:
        await svc.apply_webhook(await request.body(), dict(request.headers))
    except WebhookVerificationError:
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
