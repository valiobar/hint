from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.billing import PlanLimits

Role = Literal["superadmin", "user"]
Plan = Literal["basic", "pro"]
SubscriptionStatus = Literal["trialing", "active", "canceled", "revoked", "past_due"]


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    email: str


class UserInDB(BaseModel):
    user_id: str  # "usr_<hex8>"
    email: str
    role: Role = "user"
    password_hash: str | None = None  # None for Google-only accounts
    google_sub: str | None = None
    created_at: datetime
    plan: Plan | None = None
    subscription_status: SubscriptionStatus | None = None
    polar_customer_id: str | None = None
    polar_subscription_id: str | None = None
    current_period_end: datetime | None = None

    @property
    def has_active_subscription(self) -> bool:
        return self.role == "superadmin" or self.subscription_status in (
            "active",
            "trialing",
        )


class MeResponse(BaseModel):
    email: str
    role: Role
    created_at: datetime
    plan: Plan | None
    subscription_status: SubscriptionStatus | None
    limits: PlanLimits
