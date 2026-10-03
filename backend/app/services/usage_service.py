from datetime import datetime, timezone

from app.ai.usage import default_model
from app.config import Settings
from app.models.billing import billing_period, resolve_limits
from app.models.company import Company
from app.models.pricing import price_tier
from app.models.usage import TokenUsage, UsageKind, UsageSummary
from app.models.user import UserInDB
from app.repositories.usage_repo import UsageRepository
from app.services.polar_usage_reporter import PolarUsageReporter
from app.services.pricing_service import PricingProvider


class UsageService:
    def __init__(
        self,
        repo: UsageRepository,
        markup: float,
        pricing: PricingProvider,
        settings: Settings,
        polar: PolarUsageReporter | None = None,
    ) -> None:
        self.repo = repo
        self.markup = markup
        self.pricing = pricing
        self.settings = settings
        self.polar = polar

    async def record(
        self, company: Company, kind: UsageKind, model: str, usage: TokenUsage
    ) -> None:
        if company.owner_id is None:
            return  # legacy company predating ownership backfill
        when = datetime.now(timezone.utc)
        cost = await self.pricing.cost_usd(
            model, usage.input_tokens, usage.output_tokens, when
        )
        billable = round(cost * self.markup, 6)
        tier = price_tier(model, when)  # "peak" | "offpeak" | "flat"
        await self.repo.record(
            company.company_id,
            company.owner_id,
            kind,
            model,
            usage.input_tokens,
            usage.output_tokens,
            cost,
            billable,
            tier,
        )
        if self.polar is not None:
            await self.polar.report(company.owner_id, billable, kind)

    async def summary_for_user(self, user: UserInDB) -> UsageSummary:
        start, end = billing_period(user)
        allowance = resolve_limits(user).monthly_cost_usd
        used = round(await self.repo.total_billable(user.user_id, start, end), 6)
        overage = 0.0 if allowance < 0 else round(max(0.0, used - allowance), 6)
        # `flat` models map to "offpeak" for display: there is nothing cheaper
        # to schedule around, and the field is informational for the customer.
        tier = price_tier(default_model(self.settings), datetime.now(timezone.utc))
        return UsageSummary(
            period_start=start,
            period_end=end,
            allowance_usd=allowance,
            used_usd=used,
            overage_usd=overage,
            pricing_tier="peak" if tier == "peak" else "offpeak",
        )
