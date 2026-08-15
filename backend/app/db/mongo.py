from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

_client: AsyncIOMotorClient | None = None


def connect() -> None:
    global _client
    _client = AsyncIOMotorClient(get_settings().mongodb_url)


def close() -> None:
    if _client is not None:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    assert _client is not None, "Mongo client not initialized"
    return _client[get_settings().mongodb_db_name]


async def ping() -> bool:
    await get_db().command("ping")
    return True


async def ensure_indexes() -> None:
    db = get_db()
    await db["companies"].create_index("company_id", unique=True)
    await db["documents"].create_index("document_id", unique=True)
    await db["documents"].create_index("company_id")
