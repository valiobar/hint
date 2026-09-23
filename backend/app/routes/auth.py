import secrets
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.models.user import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserInDB,
)
from app.routes.deps import get_auth_service, require_user, resolve_limits
from app.services.auth_service import AuthService, EmailTakenError, GoogleAuthError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    svc: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    try:
        user = await svc.register(body.email, body.password)
    except EmailTakenError:
        raise HTTPException(status_code=409, detail="Email is already registered")
    token, expires_in = svc.create_access_token(user.email)
    return TokenResponse(access_token=token, expires_in=expires_in, email=user.email)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    svc: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    user = await svc.authenticate(body.email, body.password)
    if user is None:
        # same message for unknown email and bad password - no user enumeration
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token, expires_in = svc.create_access_token(user.email)
    return TokenResponse(access_token=token, expires_in=expires_in, email=user.email)


@router.get("/google/login")
async def google_login(svc: AuthService = Depends(get_auth_service)):
    if not get_settings().google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    state = secrets.token_urlsafe(16)
    response = RedirectResponse(svc.google_login_url(state))
    response.set_cookie("g_state", state, max_age=600, httponly=True, samesite="lax")
    return response


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    svc: AuthService = Depends(get_auth_service),
):
    settings = get_settings()
    if request.cookies.get("g_state") != state:
        return RedirectResponse(f"{settings.admin_ui_url}/#error=oauth_state")
    try:
        user = await svc.google_exchange(code)
    except (GoogleAuthError, httpx.HTTPError):
        return RedirectResponse(f"{settings.admin_ui_url}/#error=google_auth_failed")
    token, _ = svc.create_access_token(user.email)
    return RedirectResponse(
        f"{settings.admin_ui_url}/#token={token}&email={quote(user.email)}"
    )


@router.get("/me", response_model=MeResponse)
async def me(user: UserInDB = Depends(require_user)) -> MeResponse:
    return MeResponse(
        email=user.email,
        role=user.role,
        created_at=user.created_at,
        plan=user.plan,
        subscription_status=user.subscription_status,
        limits=resolve_limits(user),
    )
