from fastapi import APIRouter, Depends, HTTPException

from app.models.company import Company, CompanyCreate, WidgetConfigUpdate
from app.models.user import UserInDB
from app.routes.deps import get_company_service, require_owned_company, require_user
from app.services.company_service import CompanyService, PlanLimitError

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=Company, status_code=201)
async def create_company(
    body: CompanyCreate,
    user: UserInDB = Depends(require_user),
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    try:
        return await svc.create_company(body.name, user)
    except PlanLimitError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc


@router.get("", response_model=list[Company])
async def list_companies(
    user: UserInDB = Depends(require_user),
    svc: CompanyService = Depends(get_company_service),
) -> list[Company]:
    return await svc.list_companies(user)


@router.get("/{company_id}", response_model=Company)
async def get_company(
    company: Company = Depends(require_owned_company),
) -> Company:
    return company


@router.patch("/{company_id}/widget-config", response_model=Company)
async def update_widget_config(
    body: WidgetConfigUpdate,
    company: Company = Depends(require_owned_company),
    svc: CompanyService = Depends(get_company_service),
) -> Company:
    updated = await svc.update_widget_config(
        company.company_id, body.suggested_questions
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return updated
