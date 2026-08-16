from fastapi import APIRouter, Depends, HTTPException

from app.models.company import Company, CompanyCreate, WidgetConfigUpdate
from app.routes.deps import get_company_service
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=Company, status_code=201)
async def create_company(
    body: CompanyCreate,
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    return await svc.create_company(body.name)


@router.get("", response_model=list[Company])
async def list_companies(
    svc: CompanyService = Depends(get_company_service),
) -> list[Company]:
    return await svc.list_companies()


@router.get("/{company_id}", response_model=Company)
async def get_company(
    company_id: str,
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    company = await svc.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company


@router.patch("/{company_id}/widget-config", response_model=Company)
async def update_widget_config(
    company_id: str,
    body: WidgetConfigUpdate,
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    company = await svc.update_widget_config(
        company_id, body.suggested_questions
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return company
