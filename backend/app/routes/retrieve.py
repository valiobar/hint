from fastapi import APIRouter, Depends, HTTPException

from app.models.retrieval import RetrieveRequest, RetrieveResponse
from app.repositories.company_repo import CompanyRepository
from app.routes.deps import (
    get_company_repo,
    get_retrieval_service,
    require_openai_key,
)
from app.services.retrieval_service import RetrievalService

router = APIRouter(tags=["retrieval"])


@router.post(
    "/retrieve",
    response_model=RetrieveResponse,
    dependencies=[Depends(require_openai_key)],
)
async def retrieve(
    body: RetrieveRequest,
    svc: RetrievalService = Depends(get_retrieval_service),
    company_repo: CompanyRepository = Depends(get_company_repo),
) -> RetrieveResponse:
    if await company_repo.find_by_company_id(body.company_id) is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    chunks = await svc.retrieve(body.company_id, body.query, body.k)
    return RetrieveResponse(chunks=chunks)
