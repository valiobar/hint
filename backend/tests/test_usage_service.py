from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.models.company import Company
from app.models.pricing import cost_usd
from app.models.usage import TokenUsage, UsageSummary
from app.models.user import UserInDB
from app.services.pricing_service import StaticPricing
from app.services.usage_service import UsageService


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def _user(**overrides) -> UserInDB:
    payload = {
        "user_id": "usr_aaa11111",
        "email": "ada@example.com",
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    payload.update(overrides)
    return UserInDB(**payload)


def _company(*, owner_id: str | None, company_id: str = "cmp_1") -> Company:
    return Company(
        company_id=company_id,
        name="Acme",
        owner_id=owner_id,
        created_at=datetime.now(timezone.utc),
    )


class _StubRepo:
    def __init__(self, billable: float = 0.0) -> None:
        self.recorded: list[tuple] = []
        self._billable = billable

    async def record(
        self,
        company_id: str,
        owner_id: str,
        kind: str,
        model: str,
        inp: int,
        out: int,
        cost: float,
        billable: float,
        price_tier: str,
    ) -> None:
        self.recorded.append((kind, model, inp, out, cost, billable, price_tier))

    async def total_billable(self, owner_id: str, start: datetime, end: datetime) -> float:
        return self._billable


class _StubPolar:
    def __init__(self) -> None:
        self.reports: list[tuple] = []

    async def report(self, owner_id: str, billable_usd: float, kind: str) -> None:
        self.reports.append((owner_id, billable_usd, kind))


class _StubPricing:
    """Returns a fixed cost regardless of time — keeps markup tests deterministic."""

    def __init__(self, cost: float) -> None:
        self._cost = cost

    async def cost_usd(self, model, inp, out, when=None) -> float:
        return self._cost


def _service(repo, *, markup=1.3, pricing=None, polar=None, settings=None) -> UsageService:
    return UsageService(
        repo,
        markup,
        pricing or StaticPricing(),
        settings or _settings(),
        polar,
    )


@pytest.fixture
def pro_user() -> UserInDB:
    return _user(plan="pro", subscription_status="active")


@pytest.fixture
def basic_user() -> UserInDB:
    return _user(plan="basic", subscription_status="active")


@pytest.fixture
def superadmin() -> UserInDB:
    return _user(role="superadmin")


def test_cost_usd_flat_and_unknown_models() -> None:
    # gpt-4o-mini (flat): 1M in @ $0.15 + 1M out @ $0.60; time-of-use cases
    # for deepseek-flash live in test_pricing_service.py.
    assert cost_usd("gpt-4o-mini", 1_000_000, 1_000_000) == pytest.approx(0.75)
    assert cost_usd("mystery-model", 10_000, 10_000) == 0.0


@pytest.mark.asyncio
async def test_record_applies_markup_and_reports_to_polar() -> None:
    repo, polar = _StubRepo(), _StubPolar()
    svc = _service(repo, pricing=_StubPricing(0.27), polar=polar)
    await svc.record(
        _company(owner_id="usr_x"),
        "chat",
        "deepseek-flash",
        TokenUsage(input_tokens=1_000_000, output_tokens=0),  # raw $0.27 (stub)
    )
    _kind, _model, _inp, _out, cost, billable, tier = repo.recorded[0]
    assert cost == pytest.approx(0.27)
    assert billable == pytest.approx(0.351)  # 0.27 * 1.3
    assert tier in {"peak", "offpeak"}  # deepseek is time-of-use
    owner_id, reported, kind = polar.reports[0]
    assert owner_id == "usr_x"
    assert reported == pytest.approx(0.351)
    assert kind == "chat"


@pytest.mark.asyncio
async def test_record_skips_polar_when_unconfigured() -> None:
    repo = _StubRepo()
    await _service(repo, pricing=_StubPricing(0.27), polar=None).record(
        _company(owner_id="usr_x"),
        "chat",
        "deepseek-flash",
        TokenUsage(input_tokens=1_000_000, output_tokens=0),
    )
    assert repo.recorded[0][5] == pytest.approx(0.351)


@pytest.mark.asyncio
async def test_summary_overage_above_allowance(pro_user: UserInDB) -> None:
    svc = _service(_StubRepo(billable=62.5))
    summary = await svc.summary_for_user(pro_user)
    assert isinstance(summary, UsageSummary)
    assert summary.allowance_usd == 50.0
    assert summary.used_usd == pytest.approx(62.5)
    assert summary.overage_usd == pytest.approx(12.5)
    assert summary.pricing_tier in {"peak", "offpeak"}


@pytest.mark.asyncio
async def test_summary_no_overage_within_allowance(basic_user: UserInDB) -> None:
    svc = _service(_StubRepo(billable=3.0))
    summary = await svc.summary_for_user(basic_user)
    assert summary.overage_usd == 0.0


@pytest.mark.asyncio
async def test_summary_unlimited_never_overages(superadmin: UserInDB) -> None:
    svc = _service(_StubRepo(billable=999.0))
    summary = await svc.summary_for_user(superadmin)
    assert summary.allowance_usd == -1 and summary.overage_usd == 0.0


@pytest.mark.asyncio
async def test_record_skips_ownerless_company() -> None:
    repo, polar = _StubRepo(), _StubPolar()
    await _service(repo, polar=polar).record(
        _company(owner_id=None), "hint", "deepseek-flash", TokenUsage()
    )
    assert repo.recorded == [] and polar.reports == []
