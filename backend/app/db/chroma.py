import chromadb
from chromadb.api import ClientAPI
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings

_client: ClientAPI | None = None


def connect() -> None:
    global _client
    settings = get_settings()
    _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def get_chroma() -> ClientAPI:
    assert _client is not None, "Chroma client not initialized"
    return _client


async def ping() -> bool:
    await run_in_threadpool(get_chroma().heartbeat)
    return True
