from typing import Literal

from pydantic import BaseModel, Field


class ElementDescriptor(BaseModel):
    tag: str = Field(min_length=1, max_length=32)
    text: str | None = Field(default=None, max_length=220)
    role: str | None = Field(default=None, max_length=64)
    attrs: dict[str, str] = Field(default_factory=dict)
    selector_path: str = Field(min_length=1, max_length=512)


class PageContext(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    title: str = Field(max_length=512)
    headings: list[str] = Field(default_factory=list, max_length=10)
    interactive: list[ElementDescriptor] = Field(default_factory=list, max_length=60)
    visible_text_excerpt: str = Field(default="", max_length=2000)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    company_id: str = Field(min_length=1, max_length=64)
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    page_context: PageContext


class HintRequest(BaseModel):
    company_id: str = Field(min_length=1, max_length=64)
    element: ElementDescriptor
    page_context: PageContext


class HintResponse(BaseModel):
    hint: str
    source: str | None = None
