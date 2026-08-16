import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.db.chroma import get_chroma
from app.db.mongo import get_db
from app.models.company import Company
from app.models.user import AdminUser
from app.repositories.company_repo import CompanyRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.user_repo import UserRepository
from app.repositories.vector_repo import VectorRepository
from app.services.auth_service import AuthService
from app.services.company_service import CompanyService
from app.services.hint_cache import HintCache
from app.services.ingestion_service import IngestionService
from app.services.retrieval_service import RetrievalService

_hint_cache: HintCache | None = None

_bearer_scheme = HTTPBearer(auto_error=False)
_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def get_user_repo() -> UserRepository:
    return UserRepository(get_db())


def get_auth_service(
    repo: UserRepository = Depends(get_user_repo),
) -> AuthService:
    return AuthService(repo, get_settings())


async def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    svc: AuthService = Depends(get_auth_service),
) -> AdminUser:
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
    return AdminUser(email=user.email, created_at=user.created_at)


def get_company_repo() -> CompanyRepository:
    return CompanyRepository(get_db())


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


async def require_company(
    company_id: str,
    repo: CompanyRepository = Depends(get_company_repo),
) -> Company:
    company = await repo.find_by_company_id(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company
