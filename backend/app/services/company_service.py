from app.models.billing import resolve_limits
from app.models.company import Company, WidgetConfig
from app.models.user import UserInDB
from app.repositories.company_repo import CompanyRepository


class PlanLimitError(Exception):
    def __init__(self, detail: str, status: int = 403):
        self.detail = detail
        self.status = status
        super().__init__(detail)


class CompanyService:
    def __init__(self, repo: CompanyRepository):
        self.repo = repo

    async def create_company(self, name: str, user: UserInDB) -> Company:
        limits = resolve_limits(user)
        if limits.max_companies == 0:
            raise PlanLimitError(
                "An active subscription is required to create companies",
                status=402,
            )
        if await self.repo.count_by_owner(user.user_id) >= limits.max_companies:
            raise PlanLimitError(
                f"Your plan allows up to {limits.max_companies} company(ies) — "
                "upgrade to Pro for more"
            )
        return await self.repo.create(name.strip(), owner_id=user.user_id)

    async def list_companies(self, user: UserInDB) -> list[Company]:
        if user.role == "superadmin":
            return await self.repo.list_all()
        return await self.repo.list_by_owner(user.user_id)

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
