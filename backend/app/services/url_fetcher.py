import httpx
from pydantic import BaseModel

FETCH_TIMEOUT_SECONDS = 25.0
MAX_PAGE_SIZE_BYTES = 15 * 1024 * 1024
ALLOWED_CONTENT_TYPES = ("text/html", "text/plain")


class UrlFetchError(ValueError):
    pass


class FetchedPage(BaseModel):
    raw: bytes
    content_type: str
    final_url: str


async def fetch_page(url: str) -> FetchedPage:
    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise UrlFetchError(f"Failed to fetch {url}: {exc}") from exc

    content_type = response.headers.get("content-type", "").split(";")[0].strip()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise UrlFetchError(
            f"Unsupported content type: {content_type or 'unknown'}"
        )
    if len(response.content) > MAX_PAGE_SIZE_BYTES:
        raise UrlFetchError(f"{url} exceeds 10 MB limit")

    return FetchedPage(
        raw=response.content,
        content_type=content_type,
        final_url=str(response.url),
    )
