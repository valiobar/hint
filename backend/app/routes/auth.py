from fastapi import APIRouter, Depends, HTTPException

from app.models.user import AdminUser, LoginRequest, TokenResponse
from app.routes.deps import get_auth_service, require_admin
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.get("/me", response_model=AdminUser)
async def me(admin: AdminUser = Depends(require_admin)) -> AdminUser:
    return admin
