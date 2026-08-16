from fastapi import APIRouter, Depends, HTTPException

from app.models.company import WidgetConfig
from app.routes.deps import get_company_service
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["widget-config"])


@router.get("/{company_id}/widget-config", response_model=WidgetConfig)
async def get_widget_config(
    company_id: str,
    svc: CompanyService = Depends(get_company_service),
) -> WidgetConfig:
    config = await svc.get_widget_config(company_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Unknown company_id")
    return config
