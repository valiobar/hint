from app.models.company import Company, WidgetConfig
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

    async def get_widget_config(self, company_id: str) -> WidgetConfig | None:
        company = await self.repo.find_by_company_id(company_id)
        if company is None:
            return None
        return WidgetConfig(
            company_id=company.company_id,
            suggested_questions=company.suggested_questions,
        )

    async def update_widget_config(
        self, company_id: str, questions: list[str]
    ) -> Company | None:
        return await self.repo.replace_suggested_questions(
            company_id, questions
        )
