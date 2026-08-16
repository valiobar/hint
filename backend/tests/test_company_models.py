import pytest
from pydantic import ValidationError

from app.models.company import WidgetConfigUpdate


@pytest.mark.parametrize(
    "questions",
    [
        ["", "How do I export?"],
        ["x" * 121],
        ["a", "b", "c", "d", "e"],
    ],
    ids=["blank", "too-long", "five-items"],
)
def test_widget_config_update_rejects_invalid(questions: list[str]) -> None:
    with pytest.raises(ValidationError):
        WidgetConfigUpdate(suggested_questions=questions)


def test_widget_config_update_trims() -> None:
    body = WidgetConfigUpdate(suggested_questions=["  Hello  "])
    assert body.suggested_questions == ["Hello"]
