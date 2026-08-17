from html.parser import HTMLParser

import trafilatura
from pydantic import BaseModel

from app.services.text_extraction import EmptyDocumentError, extract_text


class ExtractedPage(BaseModel):
    title: str | None
    text: str


class _HtmlTitleExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_title = False
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._parts.append(data)

    def title(self) -> str | None:
        joined = " ".join(p.strip() for p in self._parts).strip()
        return joined or None


def _extract_html_title(html: str) -> str | None:
    parser = _HtmlTitleExtractor()
    parser.feed(html)
    return parser.title()


def extract_page(raw: bytes, content_type: str, url: str) -> ExtractedPage:
    decoded = raw.decode("utf-8", errors="replace")

    if content_type == "text/plain":
        text = decoded.strip()
        if not text:
            raise EmptyDocumentError("No extractable text in page")
        return ExtractedPage(title=None, text=text)

    text = trafilatura.extract(
        decoded,
        url=url,
        include_comments=False,
        include_tables=True,
        include_images=False,
        include_links=False,
    )
    metadata = trafilatura.extract_metadata(decoded, default_url=url)
    title = (metadata.title if metadata else None) or _extract_html_title(decoded)

    if not text or not text.strip():
        text = extract_text(raw, "page.html")

    return ExtractedPage(title=title, text=text)
