from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_SUGGESTED_QUESTIONS = 4
MAX_QUESTION_CHARS = 120


def normalize_suggested_questions(raw: list[str]) -> list[str]:
    cleaned = [item.strip() for item in raw]
    if any(not item for item in cleaned):
        raise ValueError("suggested_questions must not contain blank entries")
    if any(len(item) > MAX_QUESTION_CHARS for item in cleaned):
        raise ValueError(
            f"each question must be at most {MAX_QUESTION_CHARS} characters"
        )
    return cleaned


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Company(BaseModel):
    company_id: str  # short slug, e.g. "cmp_a1b2c3d4"
    name: str
    created_at: datetime
    suggested_questions: list[str] = Field(default_factory=list)


class WidgetConfig(BaseModel):
    company_id: str
    suggested_questions: list[str] = Field(default_factory=list)


class WidgetConfigUpdate(BaseModel):
    suggested_questions: list[str] = Field(max_length=MAX_SUGGESTED_QUESTIONS)

    @field_validator("suggested_questions")
    @classmethod
    def validate_questions(cls, value: list[str]) -> list[str]:
        return normalize_suggested_questions(value)
