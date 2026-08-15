from datetime import datetime

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Company(BaseModel):
    company_id: str  # short slug, e.g. "cmp_a1b2c3d4"
    name: str
    created_at: datetime
