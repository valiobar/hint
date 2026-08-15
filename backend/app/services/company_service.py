from app.models.company import Company
from app.repositories.company_repo import CompanyRepository


class CompanyService:
    def __init__(self, repo: CompanyRepository):
        self.repo = repo

    async def create_company(self, name: str) -> Company:
        return await self.repo.create(name.strip())

    async def list_companies(self) -> list[Company]:
        return await self.repo.list_all()

    async def get_company(self, company_id: str) -> Company | None:
        return await self.repo.find_by_company_id(company_id)
