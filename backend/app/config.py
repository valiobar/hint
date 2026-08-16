from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_url: str = "mongodb://localhost:27017/hint"
    mongodb_db_name: str = "hint"
    chroma_host: str = "localhost"
    chroma_port: int = 8000

    openai_api_key: str = ""  # required from Phase 1; empty allows Phase 0 boot
    llm_provider: str = "openai"  # "anthropic" reserved for later
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    hint_cache_ttl_seconds: int = 3600
    hint_cache_max_entries: int = 1024

    cors_origins: list[str] = ["*"]  # POC: widget runs on arbitrary customer origins

    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 720  # 12h; POC has no refresh-token flow

    admin_email: str = "admin@hint.local"
    admin_password: str = ""  # empty → admin seeding skipped, login always 401


@lru_cache
def get_settings() -> Settings:
    return Settings()
