from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import chroma, mongo
from app.repositories.user_repo import UserRepository
from app.routes.assist import router as assist_router
from app.routes.auth import router as auth_router
from app.routes.companies import router as companies_router
from app.routes.deps import require_admin
from app.routes.documents import router as documents_router
from app.routes.retrieve import router as retrieve_router
from app.services.auth_service import AuthService


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo.connect()
    chroma.connect()
    await mongo.ensure_indexes()
    await AuthService(
        UserRepository(mongo.get_db()), get_settings()
    ).ensure_admin_user()
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
    companies_router, prefix="/api/v1", dependencies=[Depends(require_admin)]
)
app.include_router(
    documents_router, prefix="/api/v1", dependencies=[Depends(require_admin)]
)
app.include_router(retrieve_router, prefix="/api/v1")
app.include_router(assist_router, prefix="/api/v1")


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
