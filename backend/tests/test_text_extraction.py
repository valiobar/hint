import pytest

from app.services.text_extraction import (
    EmptyDocumentError,
    UnsupportedFileTypeError,
    build_splitter,
    extract_text,
)


def test_extracts_plain_and_markdown_text() -> None:
    assert extract_text(b"# Title\nBody", "guide.md") == "# Title\nBody"
    assert extract_text(b"hello", "notes.txt") == "hello"


def test_html_strips_tags_and_scripts() -> None:
    html = b"<html><script>var x;</script><h1>Docs</h1><p>Use export.</p></html>"
    text = extract_text(html, "page.html")
    assert "Docs" in text
    assert "Use export." in text
    assert "var x" not in text


def test_rejects_unsupported_and_empty() -> None:
    with pytest.raises(UnsupportedFileTypeError):
        extract_text(b"...", "image.png")
    with pytest.raises(EmptyDocumentError):
        extract_text(b"   ", "empty.txt")


def test_build_splitter_config() -> None:
    splitter = build_splitter()
    assert splitter._chunk_size == 800
    assert splitter._chunk_overlap == 150
