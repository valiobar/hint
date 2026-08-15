from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_url: str = "mongodb://localhost:27017/hintora"
    mongodb_db_name: str = "hintora"
    chroma_host: str = "localhost"
    chroma_port: int = 8000

    openai_api_key: str = ""  # required from Phase 1; empty allows Phase 0 boot
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    cors_origins: list[str] = ["*"]  # POC: widget runs on arbitrary customer origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
