import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from polar_sdk import Polar

from app.config import get_settings
from app.db.chroma import get_chroma
from app.db.mongo import get_db
from app.models.billing import resolve_limits
from app.models.company import Company
from app.models.user import UserInDB
from app.repositories.company_repo import CompanyRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.usage_repo import UsageRepository
from app.repositories.user_repo import UserRepository
from app.repositories.vector_repo import VectorRepository
from app.services.auth_service import AuthService
from app.services.billing_service import BillingService
from app.services.company_service import CompanyService
from app.services.hint_cache import HintCache
from app.services.ingestion_service import IngestionService
from app.services.polar_usage_reporter import PolarUsageReporter
from app.services.pricing_service import (
    LivePricing,
    PricingProvider,
    StaticPricing,
)
from app.services.retrieval_service import RetrievalService
from app.services.usage_service import UsageService

_hint_cache: HintCache | None = None
_pricing: PricingProvider | None = None

_bearer_scheme = HTTPBearer(auto_error=False)
_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def get_user_repo() -> UserRepository:
    return UserRepository(get_db())


def get_auth_service(
    repo: UserRepository = Depends(get_user_repo),
) -> AuthService:
    return AuthService(repo, get_settings())


def get_billing_service() -> BillingService:
    settings = get_settings()
    if not settings.polar_access_token:
        raise HTTPException(
            status_code=503,
            detail=(
                "Polar billing is not configured; "
                "set POLAR_ACCESS_TOKEN in .env and restart"
            ),
        )
    return BillingService(get_user_repo(), settings)


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    svc: AuthService = Depends(get_auth_service),
) -> UserInDB:
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
            headers=_UNAUTHORIZED_HEADERS,
        )
    try:
        email = svc.decode_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token - sign in again",
            headers=_UNAUTHORIZED_HEADERS,
        )
    user = await svc.repo.find_by_email(email)
    if user is None:
        raise HTTPException(
            status_code=401, detail="Unknown user", headers=_UNAUTHORIZED_HEADERS
        )
    return user


def get_company_repo() -> CompanyRepository:
    return CompanyRepository(get_db())


def get_usage_repo() -> UsageRepository:
    return UsageRepository(get_db())


def get_pricing_provider() -> PricingProvider:
    global _pricing
    if _pricing is None:
        s = get_settings()
        _pricing = (
            LivePricing(s.pricing_source_url, s.pricing_refresh_ttl_seconds)
            if s.pricing_live_enabled
            else StaticPricing()
        )
    return _pricing


def get_usage_service(
    repo: UsageRepository = Depends(get_usage_repo),
) -> UsageService:
    settings = get_settings()
    polar = None
    if settings.polar_access_token:  # optional: public routes boot without Polar
        client = Polar(
            access_token=settings.polar_access_token,
            server="sandbox" if settings.polar_environment == "sandbox" else None,
        )
        polar = PolarUsageReporter(client)
    return UsageService(
        repo,
        settings.usage_billing_markup,
        get_pricing_provider(),
        settings,
        polar,
    )


def get_company_service(
    repo: CompanyRepository = Depends(get_company_repo),
) -> CompanyService:
    return CompanyService(repo)


def get_vector_repo() -> VectorRepository:
    return VectorRepository(get_chroma())


def get_document_repo() -> DocumentRepository:
    return DocumentRepository(get_db())


def get_ingestion_service(
    doc_repo: DocumentRepository = Depends(get_document_repo),
    vector_repo: VectorRepository = Depends(get_vector_repo),
) -> IngestionService:
    return IngestionService(doc_repo, vector_repo)


def get_retrieval_service(
    vector_repo: VectorRepository = Depends(get_vector_repo),
) -> RetrievalService:
    return RetrievalService(vector_repo)


def get_hint_cache() -> HintCache:
    global _hint_cache
    if _hint_cache is None:
        settings = get_settings()
        _hint_cache = HintCache(
            ttl_seconds=settings.hint_cache_ttl_seconds,
            max_entries=settings.hint_cache_max_entries,
        )
    return _hint_cache


def require_openai_key() -> None:
    if not get_settings().openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured; set it in .env and restart",
        )


def require_chat_credentials() -> None:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured; set it in .env and restart",
        )
    if settings.llm_provider == "deepseek" and not settings.deepseek_api_key:
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY is not configured; set it in .env and restart",
        )


async def require_company(
    company_id: str,
    repo: CompanyRepository = Depends(get_company_repo),
) -> Company:
    company = await repo.find_by_company_id(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company


async def require_owned_company(
    company_id: str,
    user: UserInDB = Depends(require_user),
    repo: CompanyRepository = Depends(get_company_repo),
) -> Company:
    company = await repo.find_by_company_id(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    if user.role != "superadmin" and company.owner_id != user.user_id:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company


async def require_url_ingestion(user: UserInDB = Depends(require_user)) -> None:
    if not resolve_limits(user).url_ingestion:
        raise HTTPException(
            status_code=403,
            detail="URL ingestion is a Pro feature — upgrade your plan",
        )
