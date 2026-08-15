import io
from html.parser import HTMLParser
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".txt", ".html", ".htm"}


class UnsupportedFileTypeError(ValueError):
    pass


class EmptyDocumentError(ValueError):
    pass


class _HtmlTextExtractor(HTMLParser):
    _SKIPPED_TAGS = {"script", "style"}

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self._SKIPPED_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIPPED_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._parts.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._parts)


def extract_text(raw: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFileTypeError(f"Unsupported file type: {suffix or 'none'}")

    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix in {".html", ".htm"}:
        parser = _HtmlTextExtractor()
        parser.feed(raw.decode("utf-8", errors="replace"))
        text = parser.text()
    else:  # .md / .txt
        text = raw.decode("utf-8", errors="replace")

    if not text.strip():
        raise EmptyDocumentError("No extractable text (scanned PDF or empty file)")
    return text


def build_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
