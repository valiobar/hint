from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.models.company import Company, WidgetConfig
from app.routes.deps import get_auth_service, get_company_service


class FakeCompanyService:
    def __init__(self) -> None:
        self.questions = ["How do I create an invoice?"]

    async def get_widget_config(self, company_id: str) -> WidgetConfig | None:
        if company_id != "cmp_ok":
            return None
        return WidgetConfig(
            company_id=company_id,
            suggested_questions=self.questions,
        )

    async def update_widget_config(self, company_id: str, questions: list[str]):
        if company_id != "cmp_ok":
            return None
        self.questions = questions
        return Company(
            company_id=company_id,
            name="Acme",
            created_at=datetime.now(timezone.utc),
            suggested_questions=questions,
        )


def test_public_get_returns_questions() -> None:
    fake = FakeCompanyService()
    app.dependency_overrides[get_company_service] = lambda: fake
    try:
        res = TestClient(app).get(
            "/api/v1/companies/cmp_ok/widget-config"
        )
        assert res.status_code == 200
        assert res.json()["suggested_questions"] == [
            "How do I create an invoice?"
        ]
        missing = TestClient(app).get(
            "/api/v1/companies/cmp_nope/widget-config"
        )
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_patch_requires_auth() -> None:
    # Router-level require_admin still resolves get_auth_service → Mongo.
    # Override it so the 401 path is tested without a live database.
    app.dependency_overrides[get_company_service] = lambda: FakeCompanyService()
    app.dependency_overrides[get_auth_service] = lambda: object()
    try:
        res = TestClient(app).patch(
            "/api/v1/companies/cmp_ok/widget-config",
            json={"suggested_questions": ["Hi"]},
        )
        assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()
