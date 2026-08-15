from fastapi import Depends, HTTPException

from app.config import get_settings
from app.db.chroma import get_chroma
from app.db.mongo import get_db
from app.models.company import Company
from app.repositories.company_repo import CompanyRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.vector_repo import VectorRepository
from app.services.company_service import CompanyService
from app.services.ingestion_service import IngestionService
from app.services.retrieval_service import RetrievalService


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
