import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.db import chroma, mongo
from app.repositories.user_repo import UserRepository
from app.routes.assist import router as assist_router
from app.routes.auth import router as auth_router
from app.routes.billing import router as billing_router
from app.routes.companies import router as companies_router
from app.routes.deps import require_user
from app.routes.documents import router as documents_router
from app.routes.retrieve import router as retrieve_router
from app.routes.webhooks import router as webhooks_router
from app.routes.widget_config import router as widget_config_router
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)


async def backfill_legacy_company_owners(
    db: AsyncIOMotorDatabase, admin_email: str
) -> int:
    """Assign owner_id on companies that predate ownership. Idempotent."""
    admin = await UserRepository(db).find_by_email(admin_email.strip().lower())
    if admin is None:
        return 0
    result = await db["companies"].update_many(
        {"owner_id": {"$exists": False}},
        {"$set": {"owner_id": admin.user_id}},
    )
    if result.modified_count:
        logger.info(
            "Backfilled %d legacy companies to superadmin",
            result.modified_count,
        )
    return result.modified_count


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo.connect()
    chroma.connect()
    await mongo.ensure_indexes()
    settings = get_settings()
    await AuthService(
        UserRepository(mongo.get_db()), settings
    ).ensure_admin_user()
    await backfill_legacy_company_owners(mongo.get_db(), settings.admin_email)
    yield
    mongo.close()


app = FastAPI(title="Hint Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(
    billing_router, prefix="/api/v1", dependencies=[Depends(require_user)]
)
app.include_router(
    companies_router, prefix="/api/v1", dependencies=[Depends(require_user)]
)
app.include_router(widget_config_router, prefix="/api/v1")
app.include_router(
    documents_router, prefix="/api/v1", dependencies=[Depends(require_user)]
)
app.include_router(retrieve_router, prefix="/api/v1")
app.include_router(assist_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")


@app.get("/health")
async def health() -> JSONResponse:
    statuses: dict[str, str] = {}
    for name, dep in (("mongo", mongo), ("chroma", chroma)):
        try:
            await dep.ping()
            statuses[name] = "ok"
        except Exception as exc:  # noqa: BLE001 — health must not raise
            statuses[name] = f"error: {type(exc).__name__}"
    healthy = all(v == "ok" for v in statuses.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "degraded", **statuses},
    )
