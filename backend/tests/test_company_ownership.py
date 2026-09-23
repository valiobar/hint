from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app, backfill_legacy_company_owners
from app.models.company import Company
from app.models.document import DocumentMeta
from app.models.user import UserInDB
from app.routes.deps import (
    get_company_repo,
    get_company_service,
    get_document_repo,
    get_ingestion_service,
    require_openai_key,
    require_user,
)
from app.services.company_service import CompanyService, PlanLimitError


def _user(**overrides) -> UserInDB:
    payload = {
        "user_id": "usr_aaa11111",
        "email": "ada@example.com",
        "role": "user",
        "created_at": datetime.now(timezone.utc),
    }
    payload.update(overrides)
    return UserInDB(**payload)


def _company(company_id: str, owner_id: str, name: str = "Acme") -> Company:
    return Company(
        company_id=company_id,
        name=name,
        owner_id=owner_id,
        created_at=datetime.now(timezone.utc),
    )


class FakeCompanyRepo:
    def __init__(self, companies: list[Company] | None = None) -> None:
        self.companies = list(companies or [])

    async def create(self, name: str, owner_id: str) -> Company:
        company = _company(f"cmp_{len(self.companies)}", owner_id, name)
        self.companies.append(company)
        return company

    async def count_by_owner(self, owner_id: str) -> int:
        return sum(1 for company in self.companies if company.owner_id == owner_id)

    async def list_by_owner(self, owner_id: str) -> list[Company]:
        return [company for company in self.companies if company.owner_id == owner_id]

    async def list_all(self) -> list[Company]:
        return list(self.companies)

    async def find_by_company_id(self, company_id: str) -> Company | None:
        return next(
            (company for company in self.companies if company.company_id == company_id),
            None,
        )

    async def replace_suggested_questions(
        self, company_id: str, questions: list[str]
    ) -> Company | None:
        company = await self.find_by_company_id(company_id)
        if company is None:
            return None
        updated = company.model_copy(update={"suggested_questions": questions})
        self.companies = [
            updated if item.company_id == company_id else item
            for item in self.companies
        ]
        return updated


class FakeIngestion:
    def __init__(self) -> None:
        self.files: list[tuple[str, str]] = []
        self.urls: list[tuple[str, str]] = []

    async def ingest_file(
        self, company_id: str, filename: str, raw: bytes
    ) -> DocumentMeta:
        self.files.append((company_id, filename))
        return _document(company_id, filename)

    async def ingest_url(self, company_id: str, url: str) -> DocumentMeta:
        self.urls.append((company_id, url))
        return _document(company_id, url, source_type="url", source_url=url)


class EmptyDocuments:
    async def list_by_company(self, company_id: str) -> list[DocumentMeta]:
        return []


def _document(
    company_id: str,
    filename: str,
    source_type: str = "file",
    source_url: str | None = None,
) -> DocumentMeta:
    return DocumentMeta(
        document_id="doc_1",
        company_id=company_id,
        filename=filename,
        size_bytes=5,
        status="ready",
        source_type=source_type,
        source_url=source_url,
        created_at=datetime.now(timezone.utc),
    )


@contextmanager
def _as(user: UserInDB, repo: FakeCompanyRepo, ingestion: FakeIngestion | None = None):
    async def _current_user() -> UserInDB:
        return user

    app.dependency_overrides[require_user] = _current_user
    app.dependency_overrides[get_company_repo] = lambda: repo
    app.dependency_overrides[get_company_service] = lambda: CompanyService(repo)
    app.dependency_overrides[require_openai_key] = lambda: None
    app.dependency_overrides[get_ingestion_service] = lambda: ingestion or FakeIngestion()
    app.dependency_overrides[get_document_repo] = lambda: EmptyDocuments()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_plan_limits_gate_company_creation() -> None:
    repo = FakeCompanyRepo()
    svc = CompanyService(repo)
    unsubscribed = _user()
    with pytest.raises(PlanLimitError) as blocked:
        await svc.create_company("Acme", unsubscribed)
    assert blocked.value.status == 402

    basic = _user(plan="basic", subscription_status="active")
    created = await svc.create_company("  Acme  ", basic)
    assert created.name == "Acme"
    assert created.owner_id == basic.user_id
    with pytest.raises(PlanLimitError) as limited:
        await svc.create_company("Second", basic)
    assert limited.value.status == 403
    assert "upgrade to Pro" in limited.value.detail

    pro = _user(user_id="usr_pro", plan="pro", subscription_status="trialing")
    for index in range(10):
        await svc.create_company(f"Pro {index}", pro)
    with pytest.raises(PlanLimitError):
        await svc.create_company("Eleventh", pro)

    admin = _user(user_id="usr_admin", role="superadmin")
    for _ in range(3):
        await svc.create_company("Admin Co", admin)
    assert await repo.count_by_owner(admin.user_id) == 3


@pytest.mark.asyncio
async def test_list_companies_is_scoped_to_the_owner() -> None:
    ada = _user()
    grace = _user(user_id="usr_grace", email="grace@example.com")
    repo = FakeCompanyRepo(
        [_company("cmp_ada", ada.user_id), _company("cmp_grace", grace.user_id)]
    )
    svc = CompanyService(repo)
    assert [company.company_id for company in await svc.list_companies(ada)] == [
        "cmp_ada"
    ]
    admin = _user(role="superadmin")
    assert {company.company_id for company in await svc.list_companies(admin)} == {
        "cmp_ada",
        "cmp_grace",
    }


def test_create_company_http_statuses() -> None:
    repo = FakeCompanyRepo()
    with _as(_user(), repo) as client:
        blocked = client.post("/api/v1/companies", json={"name": "Acme"})
        assert blocked.status_code == 402
        assert blocked.json()["detail"] == (
            "An active subscription is required to create companies"
        )

    basic = _user(plan="basic", subscription_status="active")
    with _as(basic, repo) as client:
        first = client.post("/api/v1/companies", json={"name": "Acme"})
        assert first.status_code == 201
        assert first.json()["owner_id"] == basic.user_id
        second = client.post("/api/v1/companies", json={"name": "Beta"})
        assert second.status_code == 403
        assert "upgrade to Pro" in second.json()["detail"]


def test_other_users_company_is_a_404_on_read_and_write() -> None:
    owner = _user()
    stranger = _user(user_id="usr_stranger", email="stranger@example.com")
    repo = FakeCompanyRepo([_company("cmp_owned", owner.user_id)])
    unknown = {"detail": "Unknown company_id"}

    with _as(stranger, repo) as client:
        assert client.get("/api/v1/companies/cmp_owned").json() == unknown
        assert client.get("/api/v1/companies/cmp_missing").json() == unknown
        patched = client.patch(
            "/api/v1/companies/cmp_owned/widget-config",
            json={"suggested_questions": ["Hi"]},
        )
        assert patched.status_code == 404
        assert patched.json() == unknown
        listed = client.get("/api/v1/companies/cmp_owned/documents")
        assert listed.status_code == 404
        assert listed.json() == unknown

    with _as(owner, repo) as client:
        assert client.get("/api/v1/companies/cmp_owned").status_code == 200
        saved = client.patch(
            "/api/v1/companies/cmp_owned/widget-config",
            json={"suggested_questions": ["How do I export?"]},
        )
        assert saved.status_code == 200
        assert saved.json()["suggested_questions"] == ["How do I export?"]


def test_superadmin_can_open_another_users_company() -> None:
    repo = FakeCompanyRepo([_company("cmp_owned", "usr_someone")])
    admin = _user(role="superadmin")
    with _as(admin, repo) as client:
        res = client.get("/api/v1/companies/cmp_owned")
        assert res.status_code == 200
        assert res.json()["company_id"] == "cmp_owned"


def test_url_ingestion_is_pro_only_and_file_upload_stays_open() -> None:
    owner = _user(plan="basic", subscription_status="active")
    repo = FakeCompanyRepo([_company("cmp_basic", owner.user_id)])
    ingestion = FakeIngestion()
    with _as(owner, repo, ingestion) as client:
        uploaded = client.post(
            "/api/v1/companies/cmp_basic/documents",
            files={"files": ("notes.txt", b"hello", "text/plain")},
        )
        assert uploaded.status_code == 201
        assert ingestion.files == [("cmp_basic", "notes.txt")]
        blocked = client.post(
            "/api/v1/companies/cmp_basic/documents/from-url",
            json={"urls": ["https://support.example.com/reset"]},
        )
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == (
            "URL ingestion is a Pro feature — upgrade your plan"
        )
        assert ingestion.urls == []

    pro = _user(
        user_id="usr_pro",
        email="pro@example.com",
        plan="pro",
        subscription_status="active",
    )
    pro_repo = FakeCompanyRepo([_company("cmp_pro", pro.user_id)])
    pro_ingestion = FakeIngestion()
    with _as(pro, pro_repo, pro_ingestion) as client:
        allowed = client.post(
            "/api/v1/companies/cmp_pro/documents/from-url",
            json={"urls": ["https://support.example.com/reset"]},
        )
        assert allowed.status_code == 201
        assert pro_ingestion.urls == [
            ("cmp_pro", "https://support.example.com/reset")
        ]

    admin = _user(user_id="usr_admin", role="superadmin")
    admin_repo = FakeCompanyRepo([_company("cmp_admin", "usr_someone")])
    admin_ingestion = FakeIngestion()
    with _as(admin, admin_repo, admin_ingestion) as client:
        allowed = client.post(
            "/api/v1/companies/cmp_admin/documents/from-url",
            json={"urls": ["https://support.example.com/admin"]},
        )
        assert allowed.status_code == 201


class MemoryCollection:
    def __init__(self, docs: list[dict] | None = None) -> None:
        self.docs = docs or []

    async def find_one(self, query: dict) -> dict | None:
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return doc
        return None

    async def update_many(self, filt: dict, update: dict) -> SimpleNamespace:
        assert filt == {"owner_id": {"$exists": False}}
        owner_id = update["$set"]["owner_id"]
        modified = 0
        for doc in self.docs:
            if "owner_id" not in doc:
                doc["owner_id"] = owner_id
                modified += 1
        return SimpleNamespace(modified_count=modified)


class MemoryDB:
    def __init__(self, users: MemoryCollection, companies: MemoryCollection) -> None:
        self._collections = {"users": users, "companies": companies}

    def __getitem__(self, name: str) -> MemoryCollection:
        return self._collections[name]


@pytest.mark.asyncio
async def test_boot_backfill_assigns_superadmin_once() -> None:
    users = MemoryCollection(
        [
            {
                "user_id": "usr_admin01",
                "email": "admin@hint.local",
                "role": "superadmin",
                "created_at": datetime.now(timezone.utc),
            }
        ]
    )
    companies = MemoryCollection(
        [
            {"company_id": "cmp_legacy"},
            {"company_id": "cmp_owned", "owner_id": "usr_other"},
        ]
    )
    db = MemoryDB(users, companies)
    first = await backfill_legacy_company_owners(db, "  Admin@Hint.Local ")
    assert first == 1
    assert companies.docs[0]["owner_id"] == "usr_admin01"
    assert companies.docs[1]["owner_id"] == "usr_other"
    assert await backfill_legacy_company_owners(db, "admin@hint.local") == 0


@pytest.mark.asyncio
async def test_boot_backfill_skips_when_admin_is_missing() -> None:
    companies = MemoryCollection([{"company_id": "cmp_legacy"}])
    modified = await backfill_legacy_company_owners(
        MemoryDB(MemoryCollection(), companies), "admin@hint.local"
    )
    assert modified == 0
    assert "owner_id" not in companies.docs[0]
