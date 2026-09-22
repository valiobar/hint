import logging

from polar_sdk import Polar
from polar_sdk.webhooks import WebhookUnknownTypeError, validate_event

from app.config import Settings
from app.models.user import UserInDB
from app.repositories.user_repo import UserRepository

logger = logging.getLogger(__name__)

_SUBSCRIPTION_EVENTS = frozenset(
    {
        "subscription.created",
        "subscription.updated",
        "subscription.active",
        "subscription.canceled",
        "subscription.revoked",
    }
)
# Polar's SubscriptionStatus includes unpaid/paused/incomplete*; UserInDB only
# accepts the five SaaS statuses from Step 2.
_STATUS_MAP = {
    "trialing": "trialing",
    "active": "active",
    "canceled": "canceled",
    "revoked": "revoked",
    "past_due": "past_due",
    "unpaid": "revoked",
    "incomplete_expired": "revoked",
    "paused": "past_due",
    "incomplete": "past_due",
}
_CLEARS_PLAN = frozenset({"canceled", "revoked"})


class BillingService:
    def __init__(self, user_repo: UserRepository, settings: Settings) -> None:
        self.user_repo = user_repo
        self.settings = settings
        self.client = Polar(
            access_token=settings.polar_access_token,
            server="sandbox" if settings.polar_environment == "sandbox" else None,
        )

    def _product_id(self, plan: str) -> str:
        return (
            self.settings.polar_product_id_basic
            if plan == "basic"
            else self.settings.polar_product_id_pro
        )

    def _plan_for_product(self, product_id: object) -> str | None:
        if not product_id:
            return None
        pid = str(product_id)
        basic = self.settings.polar_product_id_basic
        pro = self.settings.polar_product_id_pro
        if basic and pid == basic:
            return "basic"
        if pro and pid == pro:
            return "pro"
        return None

    async def create_checkout(self, user: UserInDB, plan: str) -> str:
        checkout = await self.client.checkouts.create_async(
            request={
                "products": [self._product_id(plan)],
                "external_customer_id": user.user_id,
                "customer_email": user.email,
                "success_url": f"{self.settings.admin_ui_url}/?checkout=success",
            }
        )
        return checkout.url

    async def create_portal(self, user: UserInDB) -> str:
        session = await self.client.customer_sessions.create_async(
            request={"external_customer_id": user.user_id}
        )
        return session.customer_portal_url

    async def apply_webhook(self, payload: bytes, headers: dict[str, str]) -> None:
        try:
            event = validate_event(
                payload, headers, self.settings.polar_webhook_secret
            )
        except WebhookUnknownTypeError:
            return
        event_type = _event_type(event)
        if event_type not in _SUBSCRIPTION_EVENTS:
            return
        sub = event.data
        customer = getattr(sub, "customer", None)
        user_id = (
            getattr(customer, "external_id", None) if customer is not None else None
        )
        if not user_id:
            logger.warning(
                "Polar subscription %s has no external_id", getattr(sub, "id", "?")
            )
            return
        product_id = getattr(sub, "product_id", None)
        plan = self._plan_for_product(product_id)
        status = _subscription_status(getattr(sub, "status", None), event_type)
        fields: dict[str, object] = {
            "subscription_status": status,
            "polar_customer_id": getattr(sub, "customer_id", None),
            "polar_subscription_id": getattr(sub, "id", None),
            "current_period_end": getattr(sub, "current_period_end", None),
        }
        if status in _CLEARS_PLAN:
            fields["plan"] = None
        elif plan is not None:
            fields["plan"] = plan
        else:
            logger.warning(
                "Polar subscription %s has unknown product_id %s; skipping plan write",
                getattr(sub, "id", "?"),
                product_id,
            )
        await self.user_repo.update_subscription(user_id, fields)


def _event_type(event: object) -> str:
    # polar-sdk 0.32 stores the discriminator as TYPE (alias "type"), not type_.
    raw = getattr(event, "TYPE", None)
    if raw is None:
        raw = getattr(event, "type", None)
    return str(raw or "")


def _subscription_status(raw: object, event_type: str) -> str:
    if event_type == "subscription.revoked":
        return "revoked"
    value = getattr(raw, "value", raw)
    key = str(value) if value is not None else ""
    return _STATUS_MAP.get(key, key)
