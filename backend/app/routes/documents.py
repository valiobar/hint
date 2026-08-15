from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.models.company import Company
from app.models.document import DocumentMeta
from app.repositories.document_repo import DocumentRepository
from app.routes.deps import (
    get_document_repo,
    get_ingestion_service,
    require_company,
    require_openai_key,
)
from app.services.ingestion_service import MAX_FILE_SIZE_BYTES, IngestionService

router = APIRouter(
    prefix="/companies/{company_id}/documents",
    tags=["documents"],
)


@router.post(
    "",
    response_model=list[DocumentMeta],
    status_code=201,
    dependencies=[Depends(require_openai_key)],
)
async def upload_documents(
    company: Company = Depends(require_company),
    svc: IngestionService = Depends(get_ingestion_service),
    files: list[UploadFile] = File(...),
) -> list[DocumentMeta]:
    if not files:
        raise HTTPException(status_code=422, detail="No files provided")
    results: list[DocumentMeta] = []
    for file in files:
        raw = await file.read()
        if len(raw) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{file.filename} exceeds 10 MB",
            )
        results.append(
            await svc.ingest_file(
                company.company_id,
                file.filename or "unnamed",
                raw,
            )
        )
    return results


@router.get("", response_model=list[DocumentMeta])
async def list_documents(
    company: Company = Depends(require_company),
    repo: DocumentRepository = Depends(get_document_repo),
) -> list[DocumentMeta]:
    return await repo.list_by_company(company.company_id)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    company: Company = Depends(require_company),
    svc: IngestionService = Depends(get_ingestion_service),
) -> None:
    deleted = await svc.delete_document(company.company_id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Unknown document_id")
